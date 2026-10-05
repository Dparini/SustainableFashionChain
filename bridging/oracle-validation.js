'use strict';

function validateRound(round, { now = Math.floor(Date.now() / 1000), maxAge = 3600 } = {}) {
  if (!round || round.updatedAt == null || round.answer == null || round.roundId == null || round.answeredInRound == null) {
    throw new Error('MISSING_ORACLE');
  }
  const updatedAt = Number(round.updatedAt);
  if (!Number.isSafeInteger(updatedAt) || updatedAt <= 0 || !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(maxAge) || maxAge < 0) throw new Error('INVALID_ORACLE_TIME');
  if (updatedAt > now) throw new Error('FUTURE_ORACLE');
  if (now - updatedAt > maxAge) throw new Error('STALE_ORACLE');
  if (BigInt(round.answer) <= 0n) throw new Error('INVALID_ORACLE_PRICE');
  if (BigInt(round.answeredInRound) < BigInt(round.roundId)) throw new Error('INCOMPLETE_ORACLE_ROUND');
  return { updatedAt, ageSeconds: now - updatedAt };
}

module.exports = { validateRound };
