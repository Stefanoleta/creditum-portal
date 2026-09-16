"""Telemetria mínima e sem conteúdo para o candidato G3V.

Este módulo NÃO prova sozinho que existe um único poller. Ele dá identidade aos
runtimes instrumentados e registra somente dois fatos locais:

* este consumidor tentou entrar no ciclo de conexão nativo;
* este update atravessou a admissão governada do adaptador.

Um runtime Managed antigo sem esta instrumentação continua invisível. A exclusão
dele precisa vir de fencing independente (stop comprovado ou rotação controlada da
credencial), nunca da cardinalidade deste arquivo.
"""
from __future__ import annotations

import json
import os
import pathlib
import stat
import time
import uuid
from dataclasses import dataclass

TELEMETRY_PROTOCOL = "creditum_hermes_runtime_telemetry/1.0.0"
RUNTIME_ROOT = pathlib.Path(
    "/data/creditum_hermes_runtime/telemetry/v1"
)
EVENTS_FILE = "events.jsonl"
_PROCESS_RUNTIME_INSTANCE_ID = uuid.uuid4().hex


class TelemetryRefusal(Exception):
    """A telemetria obrigatória não pôde ser persistida com segurança."""

    def __init__(self, defect: str, detail: str = "") -> None:
        super().__init__(defect if not detail else f"{defect}: {detail}")
        self.defect = defect


def _plain_identifier(value: str, field: str) -> str:
    if type(value) is not str or not value:
        raise TelemetryRefusal("TELEMETRY_IDENTIFIER_MISSING", field)
    if len(value) > 128 or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in value):
        raise TelemetryRefusal("TELEMETRY_IDENTIFIER_INVALID", field)
    return value


class RuntimeTelemetryJournal:
    """Um journal append-only por processo; nenhum payload de mensagem entra aqui."""

    def __init__(self, *, root: pathlib.Path, candidate_lineage: str) -> None:
        self._root = pathlib.Path(root)
        self._candidate_lineage = _plain_identifier(
            candidate_lineage, "candidate_lineage")
        # Um só identificador por processo, mesmo que o Hermes reexecute register()
        # ou reconstrua o journal. Criar aqui um UUID novo faria um reload parecer um
        # segundo runtime e produziria falso positivo de cardinalidade.
        self._runtime_instance_id = _PROCESS_RUNTIME_INSTANCE_ID

    @classmethod
    def production(cls, *, candidate_lineage: str) -> "RuntimeTelemetryJournal":
        """A rota de produção é fixa; não aceita caminho vindo de configuração."""
        return cls(root=RUNTIME_ROOT, candidate_lineage=candidate_lineage)

    @property
    def runtime_instance_id(self) -> str:
        return self._runtime_instance_id

    def new_consumer(self) -> "ConsumerTelemetry":
        return ConsumerTelemetry(self, uuid.uuid4().hex)

    def _open_root_directory(self) -> int:
        """Abre cada componente sem seguir links e devolve o diretório por fd."""
        if not self._root.is_absolute():
            raise TelemetryRefusal("TELEMETRY_ROOT_NOT_ABSOLUTE")

        directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        directory_flags |= getattr(os, "O_CLOEXEC", 0)
        directory_flags |= getattr(os, "O_NOFOLLOW", 0)
        try:
            current = os.open("/", directory_flags)
        except OSError as cause:
            raise TelemetryRefusal(
                "TELEMETRY_ROOT_UNAVAILABLE", type(cause).__name__) from None

        try:
            for component in self._root.parts[1:]:
                try:
                    observed = os.stat(
                        component, dir_fd=current, follow_symlinks=False)
                except FileNotFoundError:
                    try:
                        os.mkdir(component, 0o700, dir_fd=current)
                    except FileExistsError:
                        # Outra instância criou entre stat e mkdir; a abertura segura
                        # abaixo decide se o objeto resultante é aceitável.
                        pass
                    except OSError as cause:
                        raise TelemetryRefusal(
                            "TELEMETRY_ROOT_UNAVAILABLE",
                            type(cause).__name__,
                        ) from None
                except OSError as cause:
                    raise TelemetryRefusal(
                        "TELEMETRY_ROOT_UNREADABLE", type(cause).__name__) from None
                else:
                    if stat.S_ISLNK(observed.st_mode):
                        raise TelemetryRefusal(
                            "TELEMETRY_PATH_IS_SYMLINK", component)
                    if not stat.S_ISDIR(observed.st_mode):
                        raise TelemetryRefusal(
                            "TELEMETRY_PATH_NOT_DIRECTORY", component)

                try:
                    child = os.open(component, directory_flags, dir_fd=current)
                except OSError as cause:
                    raise TelemetryRefusal(
                        "TELEMETRY_DIRECTORY_OPEN_FAILED",
                        f"{component}:{type(cause).__name__}",
                    ) from None
                os.close(current)
                current = child

            root_stat = os.fstat(current)
            if not stat.S_ISDIR(root_stat.st_mode):
                raise TelemetryRefusal("TELEMETRY_ROOT_NOT_DIRECTORY")
            if root_stat.st_uid != os.geteuid():
                raise TelemetryRefusal("TELEMETRY_ROOT_OWNER_MISMATCH")
            os.fchmod(current, 0o700)
            return current
        except Exception:
            os.close(current)
            raise

    def emit(self, event: str, *, consumer_id: str, update_id: str | None = None) -> None:
        event = _plain_identifier(event, "event")
        consumer_id = _plain_identifier(consumer_id, "consumer_id")
        if update_id is not None:
            if type(update_id) is not str or not update_id.isdecimal():
                raise TelemetryRefusal("TELEMETRY_UPDATE_ID_INVALID")

        record: dict[str, object] = {
            "protocol": TELEMETRY_PROTOCOL,
            "event": event,
            "candidate_lineage": self._candidate_lineage,
            "runtime_instance_id": self._runtime_instance_id,
            "consumer_id": consumer_id,
            "observed_unix_ns": time.time_ns(),
        }
        if update_id is not None:
            record["update_id"] = update_id
        encoded = (
            json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
            + "\n"
        ).encode("ascii")
        if len(encoded) > 2048:
            raise TelemetryRefusal("TELEMETRY_RECORD_TOO_LARGE")

        flags = os.O_APPEND | os.O_CREAT | os.O_WRONLY
        flags |= getattr(os, "O_CLOEXEC", 0)
        flags |= getattr(os, "O_NOFOLLOW", 0)
        # Um FIFO plantado no caminho não pode bloquear o gateway antes do fstat.
        # Em arquivo regular a flag não altera a semântica de append/fsync.
        flags |= getattr(os, "O_NONBLOCK", 0)
        root_descriptor = self._open_root_directory()
        try:
            descriptor = os.open(
                EVENTS_FILE, flags, 0o600, dir_fd=root_descriptor)
            try:
                target_stat = os.fstat(descriptor)
                if not stat.S_ISREG(target_stat.st_mode):
                    raise TelemetryRefusal("TELEMETRY_TARGET_NOT_REGULAR")
                if target_stat.st_uid != os.geteuid():
                    raise TelemetryRefusal("TELEMETRY_TARGET_OWNER_MISMATCH")
                if target_stat.st_nlink != 1:
                    raise TelemetryRefusal("TELEMETRY_TARGET_LINK_COUNT_UNSAFE")
                os.fchmod(descriptor, 0o600)
                written = os.write(descriptor, encoded)
                if written != len(encoded):
                    raise TelemetryRefusal("TELEMETRY_SHORT_WRITE")
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        except TelemetryRefusal:
            raise
        except OSError as cause:
            raise TelemetryRefusal(
                "TELEMETRY_APPEND_FAILED", type(cause).__name__) from None
        finally:
            os.close(root_descriptor)


@dataclass(frozen=True)
class ConsumerTelemetry:
    _journal: RuntimeTelemetryJournal
    consumer_id: str

    @property
    def runtime_instance_id(self) -> str:
        return self._journal.runtime_instance_id

    def connect_attempt(self) -> None:
        # Persistido ANTES de entregar o controle ao connect nativo. Se a escrita
        # falhar, o connect não começa e nenhum poller nasce sem identidade.
        self._journal.emit(
            "telegram_consumer_connect_attempt", consumer_id=self.consumer_id)

    def update_admitted(self, update_id: str) -> None:
        # "admitted", não "received" nem "committed": só afirma o que este
        # adaptador realmente observou depois da allowlist e antes do sink.
        self._journal.emit(
            "telegram_update_admitted",
            consumer_id=self.consumer_id,
            update_id=update_id,
        )
