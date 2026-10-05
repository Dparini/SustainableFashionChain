import json
import time
from pathlib import Path
from ..policy.models import State


def demo_state(now=None):
    now = int(time.time()) if now is None else now
    return State.model_validate({
        "timestamp": now, "source": "fixture", "fabric_connected": False, "ethereum_connected": False,
        "portfolio": {"cot": "1000", "usd": "8280"},
        "reserves": {"verified_kg": "42000", "tokenized_kg": "35000", "verified": True},
        "oracle": {"price": "1.72", "updated_at": now - 32, "round_id": 1, "answered_in_round": 1},
        "market": {"quote_price": "1.72", "liquidity_usd": "100000", "fee_bps": 20},
        "supply_chain": {"delayed_shipments": 3, "rejected_batches": 1, "supplier_name": "Demo cotton cooperative"},
        "bridge_replay_detected": False, "chain_id": 1337, "block_number": 0,
    })


def load_state(path):
    return State.model_validate(json.loads(Path(path).read_text()))
