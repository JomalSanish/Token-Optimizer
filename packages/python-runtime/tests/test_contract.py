"""Phase 0 contract suite for ai_optimizer: frozen signatures, lazy LangChain, configs, fixtures.

Key exports: none (pytest module).
The golden-fixture parity tests run every case in packages/fixtures/{optimizer,router};
each must match byte for byte.
Feature: prompt optimizer + model router (Python runtime).
"""

from __future__ import annotations

import inspect
import json
import subprocess
import sys
from dataclasses import fields
from pathlib import Path

import pytest

import ai_optimizer
from ai_optimizer import (
    RouteDecision,
    get_model,
    load_router_config,
    load_techniques,
    optimize_messages,
    optimize_request,
    optimize_text,
    route,
)

PKG_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = PKG_ROOT.parent / "fixtures"
TIERS = {"economy", "standard", "advanced"}


def _cases(suite: str) -> list[dict]:
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted((FIXTURES / suite).glob("*.json"))
    ]


def _params(fn) -> list[str]:
    return list(inspect.signature(fn).parameters)


def test_frozen_signatures() -> None:
    assert _params(optimize_text) == ["text", "techniques", "config"]
    assert _params(optimize_request) == ["messages", "params", "techniques", "config"]
    assert _params(optimize_messages) == ["messages", "techniques", "config"]
    assert _params(route) == ["messages_or_text", "needs_tools", "config"]
    assert inspect.signature(route).parameters["needs_tools"].kind is inspect.Parameter.KEYWORD_ONLY
    assert _params(get_model) == ["messages_or_text", "kw"]
    assert [f.name for f in fields(RouteDecision)] == ["model", "provider", "tier", "reason"]


def test_import_without_langchain() -> None:
    code = (
        "import sys; sys.modules['langchain'] = None; "
        "import ai_optimizer; assert callable(ai_optimizer.optimize_text); "
        "assert callable(ai_optimizer.route)"
    )
    subprocess.run([sys.executable, "-c", code], cwd=PKG_ROOT, check=True)


def test_middleware_is_lazy() -> None:
    assert "ai_optimizer.middleware" not in sys.modules or "langchain" in sys.modules
    with pytest.raises(AttributeError):
        ai_optimizer.does_not_exist  # noqa: B018


def test_middleware_signatures() -> None:
    pytest.importorskip("langchain.agents.middleware")
    from ai_optimizer.middleware import ModelRouterMiddleware, PromptOptimizationMiddleware

    assert _params(PromptOptimizationMiddleware.__init__) == ["self", "techniques", "config"]
    assert _params(ModelRouterMiddleware.__init__) == ["self", "config"]
    for cls in (PromptOptimizationMiddleware, ModelRouterMiddleware):
        assert _params(cls.wrap_model_call) == ["self", "request", "handler"]


def test_default_configs_load() -> None:
    cfg = load_router_config()
    assert set(cfg["tiers"]) == TIERS
    assert cfg["rules"]["defaultTier"] in TIERS
    techniques = load_techniques()
    ids = [t["id"] for t in techniques["techniques"]]
    assert set(techniques["selected"]) <= set(ids)
    assert all(t["mode"] == "rule" for t in techniques["techniques"])


def test_fixture_suites_present() -> None:
    assert len(_cases("optimizer")) >= 2
    assert len(_cases("router")) >= 2
    for case in _cases("optimizer"):
        assert case["input"]["kind"] == case["expected"]["kind"]
    for case in _cases("router"):
        assert case["expected"]["tier"] in TIERS


@pytest.mark.parametrize("case", _cases("optimizer"), ids=lambda c: c["id"])
def test_optimizer_parity(case: dict) -> None:
    inp, exp = case["input"], case["expected"]
    if inp["kind"] == "text":
        assert optimize_text(inp["text"], case["techniques"], case.get("config")) == exp["text"]
    else:
        messages, params = optimize_request(
            inp["messages"], inp.get("params"), case["techniques"], case.get("config")
        )
        assert messages == exp["messages"]
        assert params == exp["params"]


@pytest.mark.parametrize("case", _cases("router"), ids=lambda c: c["id"])
def test_router_parity(case: dict) -> None:
    inp = case["input"]
    subject = inp["text"] if inp["kind"] == "text" else inp["messages"]
    decision = route(subject, needs_tools=case["needsTools"], config=case["config"])
    exp = case["expected"]
    assert (decision.tier, decision.model, decision.provider) == (
        exp["tier"],
        exp["model"],
        exp["provider"],
    )
