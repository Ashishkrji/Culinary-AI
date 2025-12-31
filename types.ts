
export enum DietaryRestriction {
  VEGETARIAN = 'Vegetarian',
  VEGAN = 'Vegan',
  KETO = 'Keto',
  PALEO = 'Paleo',
  GLUTEN_FREE = 'Gluten-Free',
  DAIRY_FREE = 'Dairy-Free'
}

export interface Ingredient {
  name: string;
  category: string;
  amount?: string;
}

export interface Review {
  user: string;
  rating: number;
  comment: string;
}

export interface NutritionalFacts {
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
  prepTime: string;
  calories: number;
  dietaryInfo: DietaryRestriction[];
  imagePrompt: string;
  nutritionalFacts: NutritionalFacts;
  reviews: Review[];
}

export interface ShoppingItem {
  id: string;
  name: string;
  purchased: boolean;
  storeLocation?: string;
}

export interface StoreLocation {
  name: string;
  address: string;
  uri: string;
}
