from ..policy.models import Oracle


def validate_oracle(raw, now, max_age=3600):
    oracle = Oracle.model_validate(raw)
    if oracle.updated_at > now:
        raise ValueError("FUTURE_ORACLE")
    if now - oracle.updated_at > max_age:
        raise ValueError("STALE_ORACLE")
    if oracle.answered_in_round < oracle.round_id:
        raise ValueError("INCOMPLETE_ORACLE_ROUND")
    return oracle
