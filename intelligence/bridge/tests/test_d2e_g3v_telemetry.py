from __future__ import annotations

import json
import importlib.util
import os
import pathlib
import stat
import sys
import tempfile
import unittest
from unittest import mock

from creditum_hermes_telegram.telemetry import (
    EVENTS_FILE,
    RuntimeTelemetryJournal,
    TelemetryRefusal,
)
from tests.test_d2e_telegram_adapter import (
    ContextoFalso,
    MensagemFalsa,
    desinstala_hermes,
    entrega,
    evento,
    instala_hermes,
)


class G3VTelemetryJournal(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="g3v-telemetry-")
        self.addCleanup(self.tmp.cleanup)
        # macOS expõe /var como symlink para /private/var. O journal recusa qualquer
        # symlink no caminho controlado, então a bancada usa o caminho físico.
        self.root = pathlib.Path(self.tmp.name).resolve() / "telemetry" / "v1"

    def journal(self) -> RuntimeTelemetryJournal:
        return RuntimeTelemetryJournal(
            root=self.root,
            candidate_lineage="g3v_test_lineage",
        )

    def records(self) -> list[dict[str, object]]:
        return [json.loads(line) for line in
                (self.root / EVENTS_FILE).read_text(encoding="ascii").splitlines()]

    def test_identity_is_stable_per_runtime_and_unique_per_consumer(self) -> None:
        journal = self.journal()
        one = journal.new_consumer()
        two = journal.new_consumer()
        self.assertEqual(one.runtime_instance_id, two.runtime_instance_id)
        self.assertNotEqual(one.consumer_id, two.consumer_id)

    def test_runtime_identity_is_process_scoped_across_journals(self) -> None:
        first = self.journal().new_consumer()
        second = RuntimeTelemetryJournal(
            root=self.root / "other",
            candidate_lineage="g3v_test_lineage",
        ).new_consumer()
        self.assertEqual(first.runtime_instance_id, second.runtime_instance_id)

    def test_connect_attempt_is_durable_and_contains_no_message_fields(self) -> None:
        consumer = self.journal().new_consumer()
        consumer.connect_attempt()
        [record] = self.records()
        self.assertEqual(record["event"], "telegram_consumer_connect_attempt")
        self.assertEqual(record["runtime_instance_id"], consumer.runtime_instance_id)
        self.assertEqual(record["consumer_id"], consumer.consumer_id)
        forbidden = {"token", "message_text", "chat_id", "username", "phone_number",
                     "prompt", "model_response"}
        self.assertTrue(forbidden.isdisjoint(record))
        mode = stat.S_IMODE((self.root / EVENTS_FILE).stat().st_mode)
        self.assertEqual(mode, 0o600)

    def test_update_event_says_admitted_not_received_or_committed(self) -> None:
        consumer = self.journal().new_consumer()
        consumer.update_admitted("987654321")
        [record] = self.records()
        self.assertEqual(record["event"], "telegram_update_admitted")
        self.assertEqual(record["update_id"], "987654321")
        encoded = json.dumps(record)
        self.assertNotIn("committed", encoded)
        self.assertNotIn("last_received", encoded)

    def test_invalid_update_id_fails_before_file_creation(self) -> None:
        consumer = self.journal().new_consumer()
        with self.assertRaises(TelemetryRefusal) as caught:
            consumer.update_admitted("not-native")
        self.assertEqual(caught.exception.defect, "TELEMETRY_UPDATE_ID_INVALID")
        self.assertFalse((self.root / EVENTS_FILE).exists())

    def test_symlink_root_is_refused(self) -> None:
        real = pathlib.Path(self.tmp.name) / "real"
        real.mkdir()
        link = pathlib.Path(self.tmp.name) / "link"
        link.symlink_to(real, target_is_directory=True)
        journal = RuntimeTelemetryJournal(
            root=link, candidate_lineage="g3v_test_lineage")
        with self.assertRaises(TelemetryRefusal) as caught:
            journal.new_consumer().connect_attempt()
        self.assertEqual(caught.exception.defect, "TELEMETRY_PATH_IS_SYMLINK")

    def test_symlink_in_ancestor_is_refused(self) -> None:
        real = pathlib.Path(self.tmp.name).resolve() / "real-parent"
        real.mkdir()
        link = pathlib.Path(self.tmp.name).resolve() / "linked-parent"
        link.symlink_to(real, target_is_directory=True)
        journal = RuntimeTelemetryJournal(
            root=link / "telemetry" / "v1",
            candidate_lineage="g3v_test_lineage",
        )
        with self.assertRaises(TelemetryRefusal) as caught:
            journal.new_consumer().connect_attempt()
        self.assertEqual(caught.exception.defect, "TELEMETRY_PATH_IS_SYMLINK")

    def test_hardlinked_event_file_is_refused_without_touching_source(self) -> None:
        self.root.mkdir(parents=True)
        sensitive = pathlib.Path(self.tmp.name).resolve() / "sensitive.txt"
        sensitive.write_text("baseline", encoding="ascii")
        os.link(sensitive, self.root / EVENTS_FILE)
        with self.assertRaises(TelemetryRefusal) as caught:
            self.journal().new_consumer().connect_attempt()
        self.assertEqual(
            caught.exception.defect, "TELEMETRY_TARGET_LINK_COUNT_UNSAFE")
        self.assertEqual(sensitive.read_text(encoding="ascii"), "baseline")

    def test_short_write_is_refused(self) -> None:
        consumer = self.journal().new_consumer()
        with mock.patch("os.write", return_value=1):
            with self.assertRaises(TelemetryRefusal) as caught:
                consumer.connect_attempt()
        self.assertEqual(caught.exception.defect, "TELEMETRY_SHORT_WRITE")

    def test_production_root_is_not_selected_by_environment(self) -> None:
        with mock.patch.dict(os.environ, {"HERMES_HOME": "/tmp/attacker"}):
            journal = RuntimeTelemetryJournal.production(
                candidate_lineage="g3v_test_lineage")
        self.assertEqual(str(journal._root),
                         "/data/creditum_hermes_runtime/telemetry/v1")


class ShellTelemetryBoundary(unittest.TestCase):
    class Consumer:
        def __init__(self) -> None:
            self.events: list[tuple[str, str | None]] = []

        def connect_attempt(self) -> None:
            self.events.append(("connect_attempt", None))

        def update_admitted(self, update_id: str) -> None:
            self.events.append(("update_admitted", update_id))

    class Journal:
        def __init__(self) -> None:
            self.consumers: list[ShellTelemetryBoundary.Consumer] = []

        def new_consumer(self) -> "ShellTelemetryBoundary.Consumer":
            consumer = ShellTelemetryBoundary.Consumer()
            self.consumers.append(consumer)
            return consumer

    def setUp(self) -> None:
        instala_hermes()
        self.addCleanup(desinstala_hermes)
        self.journal = self.Journal()
        shell = (pathlib.Path(__file__).resolve().parents[2] / "deploy" / "vps" /
                 "plugin-src" / "__init__.py")
        module_name = f"_g3v_plugin_shell_{id(self)}"
        spec = importlib.util.spec_from_file_location(module_name, shell)
        self.plugin = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        sys.modules[module_name] = self.plugin
        self.addCleanup(lambda: sys.modules.pop(module_name, None))
        spec.loader.exec_module(self.plugin)  # type: ignore[union-attr]
        production = mock.patch.object(
            self.plugin.RuntimeTelemetryJournal,
            "production",
            return_value=self.journal,
        )
        production.start()
        self.addCleanup(production.stop)

        self.context = ContextoFalso()
        cls = self.plugin.register(self.context)
        factory = self.context.entradas[0]["adapter_factory"]
        self.assertIs(cls._creditum_adapter_factory, factory)
        self.adapter = factory(object())
        self.consumer = self.journal.consumers[0]

    def test_factory_assigns_one_consumer_identity_per_adapter(self) -> None:
        self.assertEqual(len(self.journal.consumers), 1)
        self.assertIn("connect", self.adapter.__dict__)
        self.assertIn("_enqueue_text_event", self.adapter.__dict__)

    def test_factory_does_not_retain_plugin_context_capabilities(self) -> None:
        factory = self.context.entradas[0]["adapter_factory"]
        retained = [cell.cell_contents for cell in factory.__closure__ or ()]
        self.assertFalse(any(item is self.context for item in retained))
        self.assertFalse(any(
            isinstance(item, self.plugin._ContextoInstrumentado)
            for item in retained
        ))

    def test_connect_attempt_is_recorded_before_native_connect(self) -> None:
        import asyncio

        asyncio.run(self.adapter.connect())
        self.assertTrue(self.adapter.conectado)
        self.assertEqual(self.consumer.events[0], ("connect_attempt", None))

    def test_admitted_update_is_recorded_before_sink_effect(self) -> None:
        entrega(
            self.adapter,
            MensagemFalsa("123456789", evento(uid=987654321)),
        )
        self.assertEqual(
            self.consumer.events,
            [("connect_attempt", None), ("update_admitted", "987654321")],
        )
        self.assertEqual(len(self.plugin.drain_admitted_ingress()), 1)

    def test_telemetry_failure_prevents_native_connect(self) -> None:
        def refuse() -> None:
            raise TelemetryRefusal("TEST_CONNECT_TELEMETRY_FAILURE")

        self.consumer.connect_attempt = refuse  # type: ignore[method-assign]
        import asyncio

        with self.assertRaises(TelemetryRefusal):
            asyncio.run(self.adapter.connect())
        self.assertFalse(self.adapter.conectado)

    def test_telemetry_failure_prevents_sink_and_delivery(self) -> None:
        def refuse(_update_id: str) -> None:
            raise TelemetryRefusal("TEST_UPDATE_TELEMETRY_FAILURE")

        self.consumer.update_admitted = refuse  # type: ignore[method-assign]
        with self.assertRaises(TelemetryRefusal):
            entrega(
                self.adapter,
                MensagemFalsa("123456789", evento(uid=5)),
            )
        self.assertEqual(self.plugin.drain_admitted_ingress(), [])
        self.assertEqual(self.adapter.entregues, [])


if __name__ == "__main__":
    unittest.main()
