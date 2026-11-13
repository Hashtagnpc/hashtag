
"use strict";

const TARGETS = {
  ps5: 89900,
  gta6: 7999,
  monitor: 49999
};

function allocateCents(totalCents, weights) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new TypeError("Invalid contribution amount.");
  }

  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);

  const allocations = entries.map(([goalId, weight]) => {
    const exactShare = (totalCents * weight) / totalWeight;
    const wholeCents = Math.floor(exactShare);

    return {
      goalId,
      amountCents: wholeCents,
      remainder: exactShare - wholeCents
    };
  });

  let remainingCents =
    totalCents - allocations.reduce((sum, item) => sum + item.amountCents, 0);

  const ranked = [...allocations].sort(
    (a, b) => b.remainder - a.remainder
  );

  for (let i = 0; i < remainingCents; i++) {
    ranked[i].amountCents++;
  }

  return allocations.map(({ goalId, amountCents }) => ({
    goalId,
    amountCents
  }));
}

function allocateContribution(amountUsdCents, amountGhsPesewas, goalId) {
  const weights = goalId === "all"
    ? TARGETS
    : { [goalId]: TARGETS[goalId] };

  if (!weights || Object.values(weights).some(value => !value)) {
    throw new Error("Invalid fundraising goal.");
  }

  const usd = allocateCents(amountUsdCents, weights);

  // Split GHS using the already-rounded USD allocation shares.
  const ghsWeights = Object.fromEntries(
    usd.map(item => [item.goalId, item.amountCents])
  );

  const ghs = allocateCents(amountGhsPesewas, ghsWeights);

  return usd.map(item => ({
    goalId: item.goalId,
    amountUsdCents: item.amountCents,
    amountGhsPesewas: ghs.find(
      share => share.goalId === item.goalId
    ).amountCents
  }));
}

module.exports = {
  TARGETS,
  allocateContribution
};
