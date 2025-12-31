
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  analyzeFridgeImage, 
  generateRecipes, 
  findNearbyStores, 
  speak,
  NAVIGATION_TOOLS,
  encode,
  decode,
  decodeAudioData
} from './services/geminiService';
import { 
  DietaryRestriction, 
  Ingredient,
  Recipe, 
  ShoppingItem, 
  StoreLocation 
} from './types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// Icons
const ScanIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const RecipeIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const ShopIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>;
const SpeakerIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>;
const MicIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>;
const CloseIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const PlusIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const CheckIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const SortIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>;

type ReviewSortOrder = 'highest' | 'lowest';

const App: React.FC = () => {
  const [view, setView] = useState<'scan' | 'recipes' | 'cooking' | 'shopping'>('scan');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailedRecipe, setDetailedRecipe] = useState<Recipe | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [restrictions, setRestrictions] = useState<DietaryRestriction[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | undefined>();
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [reviewSortOrder, setReviewSortOrder] = useState<ReviewSortOrder>('highest');

  // Refs for Voice Assistant
  const sessionPromiseRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const inputAudioStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("Location permission denied or unavailable", err)
    );
  }, []);

  // Sync state for voice controls
  const viewRef = useRef(view);
  const activeStepRef = useRef(activeStep);
  const selectedRecipeRef = useRef(selectedRecipe);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { activeStepRef.current = activeStep; }, [activeStep]);
  useEffect(() => { selectedRecipeRef.current = selectedRecipe; }, [selectedRecipe]);

  // Enhanced Ingredient Helper Logic
  const isIngredientMissing = useCallback((ingName: string) => {
    if (ingredients.length === 0) return true;
    const normalizedName = ingName.toLowerCase();
    return !ingredients.some(detected => {
      const d = detected.toLowerCase();
      return d.includes(normalizedName) || normalizedName.includes(d);
    });
  }, [ingredients]);

  const sortedReviews = useMemo(() => {
    if (!detailedRecipe) return [];
    return [...detailedRecipe.reviews].sort((a, b) => {
      return reviewSortOrder === 'highest' ? b.rating - a.rating : a.rating - b.rating;
    });
  }, [detailedRecipe, reviewSortOrder]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const items = await analyzeFridgeImage(base64);
      setIngredients(items);
      setIsAnalyzing(false);
      setView('recipes');
    };
    reader.readAsDataURL(file);
  };

  const loadRecipes = useCallback(async () => {
    if (ingredients.length === 0) return;
    setIsAnalyzing(true);
    const generated = await generateRecipes(ingredients, restrictions);
    setRecipes(generated);
    setIsAnalyzing(false);
  }, [ingredients, restrictions]);

  useEffect(() => {
    if (view === 'recipes' && recipes.length === 0) {
      loadRecipes();
    }
  }, [view, recipes.length, loadRecipes]);

  const toggleRestriction = (res: DietaryRestriction) => {
    setRestrictions(prev => 
      prev.includes(res) ? prev.filter(r => r !== res) : [...prev, res]
    );
    setRecipes([]);
  };

  const startCooking = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setDetailedRecipe(null);
    setActiveStep(0);
    setView('cooking');
  };

  const addToShoppingList = (ingredientName: string) => {
    const alreadyExists = shoppingList.some(item => 
      item.name.toLowerCase().includes(ingredientName.toLowerCase())
    );
    if (alreadyExists) return;

    const newItem: ShoppingItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: ingredientName,
      purchased: false
    };
    setShoppingList(prev => [...prev, newItem]);
  };

  const addAllMissingToShoppingList = (recipe: Recipe) => {
    const missing = recipe.ingredients.filter(ing => isIngredientMissing(ing.name));
    const newItems = missing
      .filter(ing => !shoppingList.some(item => item.name.toLowerCase().includes(ing.name.toLowerCase())))
      .map(ing => ({
        id: Math.random().toString(36).substr(2, 9),
        name: `${ing.amount || ''} ${ing.name}`.trim(),
        purchased: false
      }));
    
    if (newItems.length > 0) {
      setShoppingList(prev => [...prev, ...newItems]);
    }
  };

  const [storeResults, setStoreResults] = useState<Record<string, StoreLocation[]>>({});
  const findStore = async (itemName: string) => {
    const stores = await findNearbyStores(itemName, location?.lat, location?.lng);
    setStoreResults(prev => ({ ...prev, [itemName]: stores }));
  };

  // --- Voice Assistant Implementation ---

  const stopVoiceAssistant = () => {
    setIsVoiceActive(false);
    if (inputAudioStreamRef.current) {
      inputAudioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) audioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    sessionPromiseRef.current = null;
  };

  const startVoiceAssistant = async () => {
    try {
      setIsVoiceActive(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      inputAudioStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let result = "ok";
                if (fc.name === 'navigateTo') {
                  const target = fc.args.view as any;
                  setView(target);
                  result = `Navigated to ${target}`;
                } else if (fc.name === 'cookingControl') {
                  const action = fc.args.action as string;
                  const recipe = selectedRecipeRef.current;
                  const step = activeStepRef.current;
                  if (viewRef.current !== 'cooking' || !recipe) {
                    result = "Please select a recipe and start cooking first.";
                  } else {
                    if (action === 'next' && step < recipe.instructions.length - 1) {
                      setActiveStep(s => s + 1);
                      result = `Moving to next step: ${recipe.instructions[step + 1]}`;
                    } else if (action === 'previous' && step > 0) {
                      setActiveStep(s => s - 1);
                      result = `Going back to step ${step}: ${recipe.instructions[step - 1]}`;
                    } else if (action === 'repeat') {
                      result = `Repeating step ${step + 1}: ${recipe.instructions[step]}`;
                    } else if (action === 'finish') {
                      setView('recipes');
                      result = "Cooking finished! Returning to recipes.";
                    } else {
                      result = "Action not possible at this stage.";
                    }
                  }
                }
                sessionPromise.then((session) => {
                  session.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result } }
                  });
                });
              }
            }
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputCtx) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current.values()) {
                source.stop();
                sourcesRef.current.delete(source);
              }
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Live API Error:', e);
            stopVoiceAssistant();
          },
          onclose: () => {
            stopVoiceAssistant();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          tools: [{ functionDeclarations: NAVIGATION_TOOLS }],
          systemInstruction: 'You are the "Culinary AI" voice assistant. You help users navigate the app and control cooking steps. You can navigate between "scan", "recipes", and "shopping" views. When cooking, you can go to the "next" step, "previous" step, "repeat" the current step, or "finish". Be helpful, brief, and friendly.',
        },
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error("Failed to start voice assistant:", err);
      setIsVoiceActive(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 p-6 flex-shrink-0 flex flex-col">
        <h2 className="text-2xl font-bold text-indigo-600 mb-8">Culinary AI</h2>
        <div className="flex-1 space-y-6 overflow-y-auto">
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-700 uppercase">Voice Control</span>
              {isVoiceActive && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </div>
            <button 
              onClick={isVoiceActive ? stopVoiceAssistant : startVoiceAssistant}
              className={`w-full flex items-center justify-center space-x-2 py-3 rounded-xl font-semibold transition shadow-sm ${isVoiceActive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white text-indigo-600 hover:bg-gray-50'}`}
            >
              <MicIcon />
              <span>{isVoiceActive ? 'Stop Assistant' : 'Start Assistant'}</span>
            </button>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Navigation</h3>
            <nav className="space-y-2">
              <button onClick={() => setView('scan')} className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition ${view === 'scan' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <ScanIcon /> <span>Fridge Scan</span>
              </button>
              <button onClick={() => setView('recipes')} className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition ${view === 'recipes' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <RecipeIcon /> <span>Recipe Book</span>
              </button>
              <button onClick={() => setView('shopping')} className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition ${view === 'shopping' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <ShopIcon /> <span>Shopping List</span>
              </button>
            </nav>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Dietary Filters</h3>
            <div className="space-y-2">
              {Object.values(DietaryRestriction).map(res => (
                <label key={res} className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
                  <input 
                    type="checkbox" 
                    className="form-checkbox h-4 w-4 text-indigo-600 rounded" 
                    checked={restrictions.includes(res)}
                    onChange={() => toggleRestriction(res)}
                  />
                  <span className="text-gray-700 text-sm">{res}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-h-screen">
        {view === 'scan' && (
          <div className="max-w-2xl mx-auto mt-12 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-12 border-2 border-dashed border-gray-300">
              <div className="bg-indigo-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                <ScanIcon />
              </div>
              <h1 className="text-3xl font-bold mb-4">Snap Your Fridge</h1>
              <p className="text-gray-500 mb-8">Take a photo of your open fridge and we'll tell you what's inside and what you can cook!</p>
              <label className="cursor-pointer inline-flex items-center px-8 py-4 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:bg-indigo-700 transition transform hover:scale-105 active:scale-95">
                <span>{isAnalyzing ? "Analyzing..." : "Upload Photo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isAnalyzing} />
              </label>
              {ingredients.length > 0 && (
                <div className="mt-12 text-left">
                  <h3 className="font-semibold text-gray-700 mb-3">Detected Ingredients:</h3>
                  <div className="flex flex-wrap gap-2">
                    {ingredients.map((ing, i) => (
                      <span key={i} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium border border-green-200">
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'recipes' && (
          <div className="max-w-6xl mx-auto">
            <header className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold mb-2">Recipe Suggestions</h1>
                <p className="text-gray-500">Tailored based on your ingredients and preferences.</p>
              </div>
              <button 
                onClick={loadRecipes} 
                className="bg-white border border-gray-200 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center space-x-2"
                disabled={isAnalyzing}
              >
                <span>{isAnalyzing ? "Updating..." : "Refresh Recipes"}</span>
              </button>
            </header>
            {isAnalyzing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-white rounded-2xl h-96 animate-pulse border border-gray-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {recipes.map(recipe => {
                  const missingCount = recipe.ingredients.filter(ing => isIngredientMissing(ing.name)).length;
                  return (
                    <div key={recipe.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition flex flex-col group">
                      <div className="relative overflow-hidden">
                        <img src={`https://picsum.photos/seed/${recipe.id}/400/250`} alt={recipe.title} className="w-full h-48 object-cover group-hover:scale-105 transition duration-500" />
                        {missingCount > 0 && (
                          <div className="absolute top-4 left-4 bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                            {missingCount} Items Missing
                          </div>
                        )}
                      </div>
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-bold">{recipe.title}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${recipe.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : recipe.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {recipe.difficulty}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{recipe.description}</p>
                        <div className="mt-auto grid grid-cols-2 gap-4 text-sm text-gray-500 border-t border-gray-50 pt-4 mb-6">
                          <div className="flex items-center space-x-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>{recipe.prepTime}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            <span>{recipe.calories} kcal</span>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button onClick={() => setDetailedRecipe(recipe)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition">Details</button>
                          <button onClick={() => startCooking(recipe)} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition">Start Cooking</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {detailedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in duration-300">
              <button onClick={() => setDetailedRecipe(null)} className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-md text-gray-500 hover:text-red-500 transition z-10">
                <CloseIcon />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="relative h-64 md:h-auto">
                   <img src={`https://picsum.photos/seed/${detailedRecipe.id}/800/800`} alt={detailedRecipe.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-8 md:p-12">
                  <div className="flex items-center space-x-2 mb-4">
                    {detailedRecipe.dietaryInfo.map(info => (
                      <span key={info} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full">{info}</span>
                    ))}
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">{detailedRecipe.title}</h2>
                  <p className="text-gray-600 mb-8 leading-relaxed">{detailedRecipe.description}</p>
                  
                  {detailedRecipe.ingredients.some(ing => isIngredientMissing(ing.name)) && (
                    <div className="mb-8 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-start space-x-3">
                      <div className="mt-1 bg-orange-400 p-1.5 rounded-full text-white"><ShopIcon /></div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-orange-800">Ingredients Missing</p>
                        <p className="text-xs text-orange-700 mb-3">Add items to your shopping list.</p>
                        <button onClick={() => addAllMissingToShoppingList(detailedRecipe)} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-700 transition shadow-sm flex items-center space-x-2">
                          <PlusIcon /> <span>Add All Missing</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Calories</span>
                      <span className="text-lg font-bold text-gray-800">{detailedRecipe.calories} kcal</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Time</span>
                      <span className="text-lg font-bold text-gray-800">{detailedRecipe.prepTime}</span>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h3 className="font-bold text-gray-900 mb-4">Ingredients</h3>
                    <div className="space-y-2">
                      {detailedRecipe.ingredients.map((ing, i) => {
                        const missing = isIngredientMissing(ing.name);
                        const inList = shoppingList.some(item => item.name.toLowerCase().includes(ing.name.toLowerCase()));
                        return (
                          <div key={i} className={`flex items-center justify-between p-3 rounded-xl border transition ${missing ? 'bg-orange-50/50 border-orange-100 shadow-sm' : 'bg-white border-gray-100'}`}>
                            <div className="flex items-center space-x-3">
                              <span className={`w-2 h-2 rounded-full ${missing ? 'bg-orange-400' : 'bg-green-400'}`} />
                              <div className="flex flex-col">
                                <span className={`text-sm ${missing ? 'text-orange-900 font-bold' : 'text-gray-700'}`}>{ing.amount} {ing.name}</span>
                              </div>
                            </div>
                            {missing && (
                              <button onClick={() => addToShoppingList(ing.name)} className={`p-2 rounded-lg transition shadow-sm ${inList ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`} disabled={inList}>
                                {inList ? <CheckIcon /> : <PlusIcon />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-10 p-6 bg-indigo-50/30 rounded-3xl border border-indigo-50">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-gray-900 flex items-center space-x-2">
                        <span>User Reviews</span>
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full">{detailedRecipe.reviews.length}</span>
                      </h3>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-gray-500 flex items-center space-x-1"><SortIcon /> <span>Sort:</span></span>
                        <select 
                          value={reviewSortOrder}
                          onChange={(e) => setReviewSortOrder(e.target.value as ReviewSortOrder)}
                          className="bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-700 font-medium cursor-pointer"
                        >
                          <option value="highest">Highest Rated</option>
                          <option value="lowest">Lowest Rated</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {sortedReviews.map((review, i) => (
                        <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                                {review.user.charAt(0)}
                              </div>
                              <span className="text-sm font-bold text-gray-800">{review.user}</span>
                            </div>
                            <div className="flex items-center space-x-0.5">
                              {[...Array(5)].map((_, idx) => (
                                <svg key={idx} className={`w-3 h-3 ${idx < review.rating ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed italic">"{review.comment}"</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => startCooking(detailedRecipe)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition transform active:scale-95">Start Cooking</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'cooking' && selectedRecipe && (
          <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col h-full min-h-[600px]">
            <header className="bg-indigo-600 p-8 text-white relative">
              <button onClick={() => setView('recipes')} className="absolute top-8 left-8 text-indigo-100 hover:text-white transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
              <div className="text-center pt-2">
                <h1 className="text-3xl font-bold mb-2">{selectedRecipe.title}</h1>
                <div className="flex justify-center space-x-4 text-indigo-100 text-sm">
                  <span>Step {activeStep + 1} of {selectedRecipe.instructions.length}</span>
                  <span>•</span>
                  <button onClick={() => speak(`Step ${activeStep + 1}: ${selectedRecipe.instructions[activeStep]}`)} className="flex items-center space-x-1 hover:text-white">
                    <SpeakerIcon /> <span>Read Aloud</span>
                  </button>
                </div>
              </div>
            </header>
            <div className="flex-1 p-8 md:p-12 flex flex-col justify-center text-center">
              <div className="mb-8">
                <div className="inline-block px-4 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Current Instruction</div>
                <p className="text-3xl md:text-4xl font-semibold leading-tight text-gray-800">{selectedRecipe.instructions[activeStep]}</p>
              </div>
              <div className="mt-12 text-left bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h3 className="text-lg font-bold mb-4 flex justify-between items-center">
                  <span>Ingredients Needed</span>
                  {selectedRecipe.ingredients.some(ing => isIngredientMissing(ing.name)) && (
                    <button onClick={() => addAllMissingToShoppingList(selectedRecipe)} className="text-xs font-bold text-orange-600 flex items-center space-x-1 bg-orange-100 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition">
                      <PlusIcon /> <span>Add Missing</span>
                    </button>
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedRecipe.ingredients.map((ing, i) => {
                    const missing = isIngredientMissing(ing.name);
                    const inList = shoppingList.some(item => item.name.toLowerCase().includes(ing.name.toLowerCase()));
                    return (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-xl shadow-sm group transition ${missing ? 'bg-orange-50 border border-orange-100' : 'bg-white border border-gray-100'}`}>
                        <div className="flex items-center space-x-3">
                           <span className={`w-2 h-2 rounded-full ${missing ? 'bg-orange-400' : 'bg-green-400'}`} />
                           <div className="flex flex-col">
                             <span className={`text-sm ${missing ? 'text-orange-900 font-bold' : 'text-gray-700'}`}>{ing.amount} {ing.name}</span>
                             {missing && <span className="text-[10px] text-orange-500 font-bold">MISSING</span>}
                           </div>
                        </div>
                        <button onClick={() => addToShoppingList(ing.name)} className={`p-2 rounded-lg transition ${missing ? (inList ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600') : 'text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100'}`} disabled={inList}>
                          {inList ? <CheckIcon /> : <ShopIcon />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <footer className="p-8 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <button disabled={activeStep === 0} onClick={() => setActiveStep(prev => prev - 1)} className={`px-8 py-3 rounded-xl font-bold transition ${activeStep === 0 ? 'bg-gray-200 text-gray-400' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'}`}>Previous</button>
              <div className="flex space-x-2">
                {selectedRecipe.instructions.map((_, i) => <div key={i} className={`h-2 w-2 rounded-full ${i === activeStep ? 'bg-indigo-600 w-4' : 'bg-gray-300'}`} />)}
              </div>
              {activeStep === selectedRecipe.instructions.length - 1 ? (
                <button onClick={() => setView('recipes')} className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition shadow-lg">Finish!</button>
              ) : (
                <button onClick={() => { const next = activeStep + 1; setActiveStep(next); speak(`Step ${next + 1}: ${selectedRecipe.instructions[next]}`); }} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg">Next Step</button>
              )}
            </footer>
          </div>
        )}

        {view === 'shopping' && (
          <div className="max-w-4xl mx-auto">
            <header className="mb-10"><h1 className="text-4xl font-bold mb-2">Shopping List</h1></header>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {shoppingList.length === 0 ? (
                <div className="p-12 text-center text-gray-400"><div className="mb-4 flex justify-center"><ShopIcon /></div>Empty list! Add items from recipes.</div>
              ) : (
                shoppingList.map((item) => (
                  <div key={item.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <input type="checkbox" checked={item.purchased} onChange={() => setShoppingList(prev => prev.map(i => i.id === item.id ? {...i, purchased: !i.purchased} : i))} className="h-6 w-6 text-indigo-600 rounded-lg" />
                        <span className={`text-xl ${item.purchased ? 'line-through text-gray-300' : 'text-gray-800'}`}>{item.name}</span>
                      </div>
                      <div className="flex space-x-3">
                        <button onClick={() => findStore(item.name)} className="px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">Find Stores</button>
                        <button onClick={() => setShoppingList(prev => prev.filter(i => i.id !== item.id))} className="p-2 text-gray-300 hover:text-red-500 transition"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </div>
                    {storeResults[item.name] && (
                      <div className="mt-4 ml-10 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex flex-wrap gap-4">
                          {storeResults[item.name].map((store, si) => (
                            <a key={si} href={store.uri} target="_blank" rel="noopener noreferrer" className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100 hover:border-indigo-300 transition flex items-center space-x-2">
                              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
                              <span className="text-sm font-medium">{store.name}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
