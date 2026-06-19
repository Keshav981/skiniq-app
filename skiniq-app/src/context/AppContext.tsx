import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Type definitions
export interface Profile {
  id: string;
  name: string;
  ageRange: string;
  skinType: string | null;
  skinGoals: string[];
  subscriptionStatus?: string;
}

export interface ScanScores {
  hydration: number;
  texture: number;
  pores: number;
  tone: number;
  oiliness: number;
  fine_lines: number;
  sun_damage: number;
  overall: number;
}

export interface ScanExplanations {
  hydration: string;
  texture: string;
  pores: string;
  tone: string;
  oiliness: string;
  fine_lines: string;
  sun_damage: string;
}

export interface Scan {
  id: string;
  userId: string;
  imageUrl: string | null;
  imageRetained: boolean;
  scores: ScanScores;
  explanations: ScanExplanations;
  general_summary: string;
  createdAt: string;
  detections?: Array<{
    type: 'pores' | 'dry' | 'redness' | 'lines' | 'pigment' | string;
    label: string;
    description: string;
    x: number;
    y: number;
  }>;
  recommended_products?: Product[];
  isFrontFacing?: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price_inr: number;
  affiliate_link: string;
  reason_text: string;
  dimensions: string[];
  image_url: string;
}

export interface Subscription {
  userId: string;
  status: 'free' | 'active';
  tier: 'monthly' | 'annual' | null;
  expiresAt: string | null;
}

interface AppContextType {
  profile: Profile | null;
  scans: Scan[];
  products: Product[];
  recommendedProducts: Product[];
  subscription: Subscription;
  currentScan: Scan | null;
  loading: boolean;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  saveProfile: (name: string, ageRange: string, skinType: string | null, skinGoals: string[]) => Promise<Profile>;
  loginUser: (name: string) => Promise<Profile>;
  submitPhotoForAnalysis: (imageBase64: string, savePhoto: boolean, isFrontFacing?: boolean) => Promise<Scan>;
  setCurrentScan: (scan: Scan | null) => void;
  trackProductClick: (productId: string) => Promise<void>;
  buySubscription: (tier: 'monthly' | 'annual') => Promise<void>;
  clearUserHistory: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  lastScanImageBase64: string | null;
  setLastScanImageBase64: (img: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Detect default backend URL based on platform/Metro host
const getDefaultBackendUrl = () => {
  if (Platform.OS === 'web') {
    // If running in production browser (e.g. Surge), use the public tunnel URL
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return 'https://skiniq-api-2026-prod.loca.lt';
    }
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    return `http://${hostIp}:3000`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000'; // Default Android emulator localhost bypass
  }
  return 'http://localhost:3000'; // iOS simulator or web
};

// Generate RFC4122 version 4 compliant UUID
const generateUUIDv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [subscription, setSubscription] = useState<Subscription>({
    userId: '',
    status: 'free',
    tier: null,
    expiresAt: null
  });
  const [currentScan, setCurrentScanState] = useState<Scan | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [backendUrl, setBackendUrlState] = useState<string>(getDefaultBackendUrl());
  const [lastScanImageBase64, setLastScanImageBase64] = useState<string | null>(null);

  // Load configured backend URL and local profile on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        let activeUrl = getDefaultBackendUrl();
        const isProdWeb = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        let githubFetched = false;

        // Dynamically discover active backend URL from GitHub on web in production
        if (isProdWeb) {
          try {
            console.log('[SkinIQ] Resolving dynamic backend URL from GitHub...');
            const discRes = await fetch('https://raw.githubusercontent.com/Keshav981/skiniq-app/main/backend_url.txt');
            if (discRes.ok) {
              const urlText = (await discRes.text()).trim();
              if (urlText.startsWith('https://')) {
                activeUrl = urlText;
                githubFetched = true;
                console.log(`[SkinIQ] Dynamically discovered active backend URL: ${activeUrl}`);
                setBackendUrlState(activeUrl);
              }
            }
          } catch (discErr) {
            console.warn('[SkinIQ] Dynamic backend URL discovery failed:', discErr);
          }
        }

        // Only override with savedUrl if we didn't successfully fetch from GitHub in production web
        if (!githubFetched) {
          const savedUrl = await AsyncStorage.getItem('@skiniq_backend_url');
          if (savedUrl) {
            // If the saved URL is a local LAN IP, check if the current Metro IP is different and update it
            const localIpRegex = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
            if (localIpRegex.test(savedUrl)) {
              const currentHostUri = Constants.expoConfig?.hostUri;
              if (currentHostUri) {
                const currentHostIp = currentHostUri.split(':')[0];
                const savedIp = savedUrl.replace('http://', '').split(':')[0];
                if (savedIp !== currentHostIp) {
                  const port = savedUrl.split(':').pop();
                  const portVal = port && !isNaN(Number(port)) ? port : '3000';
                  const newUrl = `http://${currentHostIp}:${portVal}`;
                  console.log(`[SkinIQ] Dynamic host IP change detected: migrating backend URL from ${savedUrl} to ${newUrl}`);
                  activeUrl = newUrl;
                  await AsyncStorage.setItem('@skiniq_backend_url', newUrl);
                } else {
                  activeUrl = savedUrl;
                }
              } else {
                activeUrl = savedUrl;
              }
            } else {
              activeUrl = savedUrl;
            }
            setBackendUrlState(activeUrl);
          } else {
            setBackendUrlState(activeUrl);
          }
        } else {
          setBackendUrlState(activeUrl);
        }

        const savedProfile = await AsyncStorage.getItem('@skiniq_profile');
        if (savedProfile) {
          const parsedProfile = JSON.parse(savedProfile);
          
          // Legacy check: if the profile ID is not a valid UUID, convert it and save it
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(parsedProfile.id)) {
            console.log(`[SkinIQ] Legacy profile ID "${parsedProfile.id}" detected, migrating to UUID...`);
            parsedProfile.id = generateUUIDv4();
            await AsyncStorage.setItem('@skiniq_profile', JSON.stringify(parsedProfile));
          }
          
          setProfile(parsedProfile);
          
          // Load other data tied to this profile using activeUrl to avoid stale closure state
          await fetchUserData(parsedProfile.id, activeUrl);
        }
        
        // Fetch all product catalog items
        await fetchProducts(activeUrl);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };
    initialize();
  }, []);

  const setBackendUrl = async (url: string) => {
    setBackendUrlState(url);
    await AsyncStorage.setItem('@skiniq_backend_url', url);
  };

  const fetchUserData = async (userId: string, overrideUrl?: string) => {
    const url = overrideUrl || backendUrl;
    try {
      // Check if profile exists on the backend, and if not, sync it
      const profileRes = await fetch(`${url}/api/profile/${userId}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (profileRes.status === 404) {
        const savedProfile = await AsyncStorage.getItem('@skiniq_profile');
        if (savedProfile) {
          const parsedProfile = JSON.parse(savedProfile);
          console.log(`[SkinIQ] Syncing profile ${userId} to backend...`);
          await fetch(`${url}/api/profile`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify(parsedProfile)
          });
        }
      }

      // 1. Fetch Subscription status
      const subRes = await fetch(`${url}/api/subscription/${userId}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscription(subData);
      }

      // 2. Fetch Scan History
      const scanRes = await fetch(`${url}/api/scans/${userId}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (scanRes.ok) {
        const scanHistory = await scanRes.json();
        setScans(scanHistory);
        if (scanHistory.length > 0) {
          const latestScan = scanHistory[0];
          setCurrentScanState(latestScan); // Default to latest scan
          if (latestScan.recommended_products && latestScan.recommended_products.length > 0) {
            setRecommendedProducts(latestScan.recommended_products);
          } else {
            calculateRecommendations(latestScan, url);
          }
        }
      }
    } catch (err) {
      console.warn('Could not sync user data from backend, using local defaults:', err);
    }
  };

  const fetchProducts = async (overrideUrl?: string) => {
    const url = overrideUrl || backendUrl;
    try {
      const res = await fetch(`${url}/api/products`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (res.ok) {
        const productsList = await res.json();
        setProducts(productsList);
      }
    } catch (err) {
      console.warn('Could not load products catalog:', err);
    }
  };

  const calculateRecommendations = async (scan: Scan, overrideUrl?: string) => {
    const url = overrideUrl || backendUrl;
    // Find lowest scoring 2-3 categories
    const scoreMap = { ...scan.scores };
    delete (scoreMap as any).overall; // don't recommend products based on overall

    const sortedDimensions = Object.keys(scoreMap).sort((a, b) => {
      // pores score behaves inversely (lower is better, so 100 - score is its quality)
      const valA = a === 'pores' ? 100 - scoreMap[a as keyof ScanScores] : scoreMap[a as keyof ScanScores];
      const valB = b === 'pores' ? 100 - scoreMap[b as keyof ScanScores] : scoreMap[b as keyof ScanScores];
      return valA - valB;
    });

    const lowestDimensions = sortedDimensions.slice(0, 3);
    
    try {
      const res = await fetch(`${url}/api/products/recommend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify({ lowestDimensions })
      });
      if (res.ok) {
        const recList = await res.json();
        setRecommendedProducts(recList);
      }
    } catch (err) {
      console.warn('Failed to fetch product recommendations:', err);
    }
  };

  const saveProfile = async (name: string, ageRange: string, skinType: string | null, skinGoals: string[]) => {
    setLoading(true);
    try {
      // Generate a user ID if none exists or is invalid
      let userId = profile?.id;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!userId || !uuidRegex.test(userId)) {
        userId = generateUUIDv4();
      }

      const profilePayload = { id: userId, name, ageRange, skinType, skinGoals };
      
      const res = await fetch(`${backendUrl}/api/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify(profilePayload)
      });

      const saved = res.ok ? await res.json() : profilePayload;
      setProfile(saved);
      await AsyncStorage.setItem('@skiniq_profile', JSON.stringify(saved));
      
      // Update subscription ID link
      setSubscription(prev => ({ ...prev, userId: saved.id }));
      
      return saved;
    } catch (err) {
      console.error('Save profile failed:', err);
      // Fallback local write
      const fallbackId = (profile?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profile.id))
        ? profile.id
        : generateUUIDv4();
      const mockProfile: Profile = { id: fallbackId, name, ageRange, skinType, skinGoals };
      setProfile(mockProfile);
      await AsyncStorage.setItem('@skiniq_profile', JSON.stringify(mockProfile));
      return mockProfile;
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (name: string): Promise<Profile> => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/profile/login?name=${encodeURIComponent(name)}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Profile not found. Please register as a new user.');
        }
        throw new Error('Login failed. Please verify your connection or try again.');
      }
      const existingProfile = await res.json();
      setProfile(existingProfile);
      await AsyncStorage.setItem('@skiniq_profile', JSON.stringify(existingProfile));
      
      // Load user scans, subscriptions, and products tied to this profile
      await fetchUserData(existingProfile.id, backendUrl);
      
      return existingProfile;
    } catch (err: any) {
      console.error('Login user failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const submitPhotoForAnalysis = async (imageBase64: string, savePhoto: boolean, isFrontFacing: boolean = false) => {
    if (!profile) throw new Error('User profile is not configured');
    
    setLoading(true);
    try {
      let res = await fetch(`${backendUrl}/api/scans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify({
          userId: profile.id,
          imageBase64,
          savePhoto,
          isFrontFacing
        })
      });
 
      // Handle user profile missing from backend database (e.g. backend restart/wipe)
      if (res.status === 404) {
        const errJson = await res.clone().json();
        if (errJson.error === 'User profile not found') {
          console.log(`[SkinIQ] User profile not found on backend. Syncing and retrying...`);
          const syncRes = await fetch(`${backendUrl}/api/profile`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify(profile)
          });
          if (syncRes.ok) {
            res = await fetch(`${backendUrl}/api/scans`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
              },
              body: JSON.stringify({
                userId: profile.id,
                imageBase64,
                savePhoto,
                isFrontFacing
              })
            });
          }
        }
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to analyze skin image');
      }

      const newScan: Scan = await res.json();
      
      // Prepend to scan history
      setScans(prev => [newScan, ...prev]);
      setCurrentScanState(newScan);
      setLastScanImageBase64('data:image/jpeg;base64,' + imageBase64);
      
      // Compute product list matching lowest categories
      if (newScan.recommended_products && newScan.recommended_products.length > 0) {
        setRecommendedProducts(newScan.recommended_products);
      } else {
        await calculateRecommendations(newScan);
      }
      
      return newScan;
    } catch (err) {
      console.error('Scan analysis failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const setCurrentScan = (scan: Scan | null) => {
    setCurrentScanState(scan);
    if (scan) {
      if (scan.recommended_products && scan.recommended_products.length > 0) {
        setRecommendedProducts(scan.recommended_products);
      } else {
        calculateRecommendations(scan);
      }
    }
  };

  const trackProductClick = async (productId: string) => {
    if (!profile) return;
    try {
      await fetch(`${backendUrl}/api/clicks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify({
          userId: profile.id,
          productId,
          scanId: currentScan?.id
        })
      });
      console.log(`Successfully logged affiliate click for product: ${productId}`);
    } catch (err) {
      console.warn('Affiliate tracking fail:', err);
    }
  };

  const buySubscription = async (tier: 'monthly' | 'annual') => {
    if (!profile) return;
    
    setLoading(true);
    try {
      const expiresAt = new Date();
      if (tier === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      const res = await fetch(`${backendUrl}/api/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify({
          userId: profile.id,
          status: 'active',
          tier,
          expiresAt: expiresAt.toISOString()
        })
      });

      if (res.ok) {
        const subData = await res.json();
        setSubscription(subData);
        
        // Update local profile status
        const updatedProfile = { ...profile, subscriptionStatus: 'active' };
        setProfile(updatedProfile);
        await AsyncStorage.setItem('@skiniq_profile', JSON.stringify(updatedProfile));
      }
    } catch (err) {
      console.error('Failed to buy subscription:', err);
      // Mock fallback
      const mockSub: Subscription = {
        userId: profile.id,
        status: 'active',
        tier,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      setSubscription(mockSub);
    } finally {
      setLoading(false);
    }
  };

  const clearUserHistory = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/history/${profile.id}`, {
        method: 'DELETE',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
    } catch (err) {
      console.warn('Backend history deletion warning:', err);
    } finally {
      // Always purge local storage
      setScans([]);
      setCurrentScanState(null);
      setRecommendedProducts([]);
      setLastScanImageBase64(null);
      setSubscription({
        userId: profile.id,
        status: 'free',
        tier: null,
        expiresAt: null
      });
      
      const resetProfile = { ...profile, skinGoals: [], skinType: null };
      setProfile(resetProfile);
      await AsyncStorage.setItem('@skiniq_profile', JSON.stringify(resetProfile));
      
      setLoading(false);
    }
  };

  const refreshHistory = async () => {
    if (profile) {
      await fetchUserData(profile.id);
    }
  };

  return (
    <AppContext.Provider value={{
      profile,
      scans,
      products,
      recommendedProducts,
      subscription,
      currentScan,
      loading,
      backendUrl,
      setBackendUrl,
      saveProfile,
      loginUser,
      submitPhotoForAnalysis,
      setCurrentScan,
      trackProductClick,
      buySubscription,
      clearUserHistory,
      refreshHistory,
      lastScanImageBase64,
      setLastScanImageBase64
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
