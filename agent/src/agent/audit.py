import json
import os
import math
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4
from eth_hash.auto import keccak
from pydantic import BaseModel


def plain(value):
    if isinstance(value, BaseModel):
        return plain(value.model_dump())
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, Decimal) and not value.is_finite():
        return str(value)
    if isinstance(value, Decimal):
        text = format(value, "f")
        return (text.rstrip("0").rstrip(".") if "." in text else text) if value != 0 else "0"
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def canonical(value):
    return json.dumps(plain(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return "0x" + keccak(canonical(value).encode("utf-8")).hex()


def record(state, risk, proposal, policy, simulation, execution=None, error=None, model="deterministic-baseline"):
    return {"decisionId": "dec_" + uuid4().hex,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "stateHash": digest(state), "state": plain(state), "model": model,
            "riskReport": plain(risk), "proposal": plain(proposal),
            "policyResult": plain(policy), "simulation": plain(simulation),
            "executionTx": execution, "error": error}


def append_record(path, entry):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        data = (canonical(entry) + "\n").encode()
        with os.fdopen(fd, "ab") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        raise
