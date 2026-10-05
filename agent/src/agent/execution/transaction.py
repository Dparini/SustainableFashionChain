from decimal import Decimal as D, ROUND_CEILING, ROUND_FLOOR


class TransactionBuilder:
    """Fixed ABI and destination. Never accepts model-supplied calldata or address."""
    def __init__(self, reader, policies):
        self.reader, self.policies = reader, policies

    def build(self, action, state):
        if action.action == "HOLD":
            return None
        if state.source == "fixture":
            raise ValueError("LIVE_STATE_REQUIRED")
        amount = int(action.amount * 10**18)
        nominal = action.amount * state.oracle.price * 10**6
        slip = D(self.policies.market.max_slippage_bps) / 10000
        deadline = state.timestamp + 60
        market = self.reader.contracts["DemoCotMarket"]
        if action.action == "BUY_COT":
            bound = int((nominal * (1 + slip)).to_integral_value(rounding=ROUND_CEILING))
            function = market.functions.buy(amount, bound, deadline)
        elif action.action == "SELL_COT":
            bound = int((nominal * (1 - slip)).to_integral_value(rounding=ROUND_FLOOR))
            function = market.functions.sell(amount, bound, deadline)
        else:
            raise ValueError("UNKNOWN_ACTION")
        return {"from": self.reader.account, "to": market.address, "data": function._encode_transaction_data(), "value": 0}
