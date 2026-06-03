/**
 * Calculates the recommended bet sizing based on the Kelly Criterion.
 * 
 * @param probability IA calculated probability of winning (value between 0 and 1)
 * @param bookmakerOdd The odd offered by the bookmaker (e.g. 2.10)
 * @param bankrollFraction The fraction of Kelly to use (default 0.25 for quarter-Kelly to reduce variance)
 * @param maxStakePercent The absolute maximum percentage of bankroll to wager on a single bet (default 5.0%)
 * @returns Object with the raw stake percentage, fractional stake percentage, and whether the bet has positive EV.
 */
export function calculateKelly(
  probability: number,
  bookmakerOdd: number,
  bankrollFraction: number = 0.25,
  maxStakePercent: number = 5.0
): {
  rawStakePercent: number;
  suggestedStakePercent: number;
  hasValue: boolean;
  evPercent: number;
} {
  if (bookmakerOdd <= 1 || probability <= 0 || probability >= 1) {
    return { rawStakePercent: 0, suggestedStakePercent: 0, hasValue: false, evPercent: 0 };
  }

  // Net odds (b = decimal odd - 1)
  const b = bookmakerOdd - 1;
  const q = 1 - probability;

  // Expected Value (EV%) = (Probability * Odd) - 1
  const ev = (probability * bookmakerOdd) - 1;
  const evPercent = parseFloat((ev * 100).toFixed(2));

  // Kelly Formula: f* = (p * b - q) / b
  const fStar = (probability * b - q) / b;

  if (fStar <= 0 || ev <= 0) {
    return {
      rawStakePercent: 0,
      suggestedStakePercent: 0,
      hasValue: false,
      evPercent: evPercent > 0 ? evPercent : 0
    };
  }

  const rawStakePercent = parseFloat((fStar * 100).toFixed(2));
  
  // Apply fractional Kelly multiplier
  let suggestedStake = fStar * bankrollFraction * 100;
  
  // Limit to maximum safety boundary (maxStakePercent)
  if (suggestedStake > maxStakePercent) {
    suggestedStake = maxStakePercent;
  }
  
  const suggestedStakePercent = parseFloat(suggestedStake.toFixed(2));

  return {
    rawStakePercent,
    suggestedStakePercent,
    hasValue: true,
    evPercent
  };
}
