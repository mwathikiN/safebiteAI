async function analyzeFood({ ingredients, imageBuffer, userProfile }) {
  // Split ingredients text
  const ingredientList = ingredients ? ingredients.split(',').map(i => i.trim()) : [];

  // Simple AI logic for testing
  let risk = "Low Risk";
  let reason = "No allergens detected";

  if (userProfile?.allergicFoods?.some(a => ingredientList.includes(a))) {
    risk = "High Risk";
    reason = `Contains allergens: ${userProfile.allergicFoods.filter(a => ingredientList.includes(a)).join(', ')}`;
  }

  const recommendations = risk === "High Risk"
    ? ["Avoid this item"]
    : ["Safe to consume"];

  return {
    risk,
    reason,
    ingredients: ingredientList,
    recommendations
  };
}

module.exports = { analyzeFood };
