import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  Switch,
  Animated,
  Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { useApp, Scan, Product, ScanScores, ScanExplanations } from '../context/AppContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper to compress image on web using canvas to avoid OOM crashes
const compressImageWeb = (uri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const rawBase64 = dataUrl.split(',')[1];
        resolve(rawBase64);
      } else {
        reject(new Error('Canvas context failed'));
      }
    };
    img.onerror = (err) => reject(err);
    img.src = uri;
  });
};

// Helper to convert URI (like blob or local file) to base64
const getBase64FromUri = async (uri: string): Promise<string> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      return await compressImageWeb(uri);
    } catch (err) {
      console.warn('Canvas compression failed, falling back to raw reader:', err);
    }
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const rawBase64 = base64data.split(',')[1];
      resolve(rawBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Color Palette (Warm Rose & Blush Tech Aesthetics)
const COLORS = {
  bgLight: '#FAFAF8',
  bgCard: '#FFFFFF',
  rosePrimary: '#D4537E',
  roseDark: '#A03054',
  roseLight: '#FDF0F3',
  roseMuted: '#E5A5B8',
  textDark: '#3C2F30',
  textMuted: '#8E7C7D',
  goldAccent: '#D4AF37',
  greenSuccess: '#6E9E80',
  glassBorder: '#F5E4E4',
  shadowColor: 'rgba(212, 83, 126, 0.12)',
  greyLight: '#F3EFEF'
};

const dimIngredients: Record<string, string> = {
  hydration: 'Hyaluronic Acid, Panthenol, Ceramides NP/AP',
  texture: 'Gluconolactone (PHA), Squalane, Lactic Acid (AHA)',
  pores: 'Salicylic Acid (BHA), Zinc PCA, Niacinamide',
  tone: 'Alpha Arbutin, Kojic Acid, Tranexamic Acid, Licorice Root',
  oiliness: 'Kaolin/Bentonite Clay, Green Tea Polyphenols, Niacinamide',
  fine_lines: 'Retinol, Copper Tripeptide-1, Matrixyl 3000, Bakuchiol',
  sun_damage: 'L-Ascorbic Acid (Vitamin C), Vitamin E, Broad-Spectrum SPF 50+'
};

const dimActions: Record<string, string> = {
  hydration: 'Apply humectant serum on damp skin; lock with a lipid-rich cream.',
  texture: 'Exfoliate 2x weekly at night with gentle PHA; avoid physical scrubs.',
  pores: 'Use double cleansing nightly; apply BHA treatment strictly on congested T-zone.',
  tone: 'Apply tyrosinase inhibitors twice daily; integrate Centella for redness.',
  oiliness: 'Use lightweight gel moisturizers; apply clay masks strictly to T-zone 1-2x weekly.',
  fine_lines: 'Apply retinoids at night; use peptide treatments morning and night.',
  sun_damage: 'Apply sunscreen every 3 hours; use Vitamin C serum in morning routines.'
};

export default function AppIndex() {
  const {
    profile: realProfile,
    scans: realScans,
    recommendedProducts,
    subscription: realSubscription,
    currentScan: realCurrentScan,
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
    lastScanImageBase64
  } = useApp();

  // Mock data for Design Review Preview Inspector Mode
  const MOCK_PROFILE = {
    name: 'Aishwarya',
    age: '26–35',
    skinType: 'combination',
    goals: ['Brightening', 'Hydration', 'Anti-aging']
  };

  const MOCK_SCANS: Scan[] = [
    {
      id: 'scan-1',
      createdAt: new Date().toISOString(),
      imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300',
      scores: {
        overall: 84,
        hydration: 88,
        texture: 79,
        pores: 35,
        tone: 82,
        oiliness: 52,
        fine_lines: 85,
        sun_damage: 89
      },
      explanations: {
        hydration: 'Your stratum corneum shows high water retention. Keep using humectants.',
        texture: 'Epidermis is largely smooth with minor micro-relief changes around cheeks.',
        pores: 'Excellent pore refinement. Clear follicular ducts.',
        tone: 'Even melanin distribution. Minor localized vascular congestion.',
        oiliness: 'Well-regulated sebum levels across the forehead and cheeks.',
        fine_lines: 'Dermal elasticity is optimal. Trace fine lines under lower eyelids.',
        sun_damage: 'Minimal UV hyperpigmentation detected. Continue sunscreen use.'
      }
    },
    {
      id: 'scan-2',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300',
      scores: {
        overall: 78,
        hydration: 72,
        texture: 74,
        pores: 48,
        tone: 75,
        oiliness: 68,
        fine_lines: 79,
        sun_damage: 82
      },
      explanations: {
        hydration: 'Mild moisture loss in epidermal layers.',
        texture: 'Mild roughness detected on chin and nasal bridge.',
        pores: 'Pores are slightly visible on T-zone due to sebum build-up.',
        tone: 'Mild erythema around cheek area.',
        oiliness: 'Moderate oil build-up on forehead and nose.',
        fine_lines: 'Dynamic lines starting to show near corners of eyes.',
        sun_damage: 'Light UV discoloration visible under polarized light analysis.'
      }
    }
  ];

  // Design Inspector States
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [previewScreenId, setPreviewScreenId] = useState<number | null>(null);
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const [selectedPastScan, setSelectedPastScan] = useState<Scan | null>(null);

  const profile = isPreviewActive 
    ? ([1, 2, 3, 4, 5].includes(previewScreenId || 0) ? null : MOCK_PROFILE) 
    : realProfile;
  const scans = isPreviewActive ? MOCK_SCANS : (realScans.length > 0 ? realScans : MOCK_SCANS);
  const subscription = isPreviewActive 
    ? (previewScreenId === 11 ? { status: 'free' } : { status: 'active' })
    : realSubscription;
  const currentScan = isPreviewActive 
    ? (selectedPastScan || MOCK_SCANS[0]) 
    : (realCurrentScan || (realScans.length > 0 ? realScans[0] : (scans.length > 0 ? scans[0] : null)));

  const totalScans = scans.length;
  const daysTracking = scans.length > 0 
    ? Math.max(1, Math.ceil((Date.now() - new Date(scans[scans.length - 1].createdAt).getTime()) / (1000 * 60 * 60 * 24))) 
    : 0;
  const avgImprovement = scans.length >= 2 
    ? scans[0].scores.overall - scans[1].scores.overall 
    : 0;

  const FALLBACK_PRODUCTS = [
    {
      id: 'prod-1',
      name: 'Hyaluronic Acid 2% + B5',
      brand: 'Minimalist',
      category: 'serum',
      price_inr: 599,
      image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['hydration'],
      affiliate_link: 'https://www.amazon.in/dp/B08V89NTCS?tag=skiniq-21'
    },
    {
      id: 'prod-3',
      name: 'Water Drench Hydrating Gel',
      brand: 'Dot & Key',
      category: 'moisturizer',
      price_inr: 395,
      image_url: 'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['hydration'],
      affiliate_link: 'https://www.amazon.in/dp/B08DFW9HNS?tag=skiniq-21'
    },
    {
      id: 'prod-4',
      name: '10% Niacinamide Face Serum',
      brand: 'Minimalist',
      category: 'serum',
      price_inr: 599,
      image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['texture', 'pores'],
      affiliate_link: 'https://www.amazon.in/dp/B08FF3VP62?tag=skiniq-21'
    },
    {
      id: 'prod-5',
      name: 'Niacinamide 10% + Zinc 1%',
      brand: 'The Ordinary',
      category: 'serum',
      price_inr: 600,
      image_url: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['texture', 'pores', 'oiliness'],
      affiliate_link: 'https://n/a'
    },
    {
      id: 'prod-7',
      name: '2% Salicylic Acid Face Serum',
      brand: 'Minimalist',
      category: 'serum',
      price_inr: 549,
      image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['pores', 'oiliness'],
      affiliate_link: 'https://n/a'
    },
    {
      id: 'prod-10',
      name: 'Alpha Arbutin 2% + HA',
      brand: 'Minimalist',
      category: 'serum',
      price_inr: 549,
      image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['tone', 'sun_damage'],
      affiliate_link: 'https://n/a'
    },
    {
      id: 'prod-13',
      name: '0.3% Retinol + Coenzyme Q10',
      brand: 'Minimalist',
      category: 'serum',
      price_inr: 599,
      image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=300&h=300&q=80',
      dimensions: ['fine_lines'],
      affiliate_link: 'https://n/a'
    }
  ];

  const getDisplayProducts = () => {
    if (recommendedProducts && recommendedProducts.length > 0) {
      return recommendedProducts;
    }
    if (!profile) return [];
    
    // Map goals list to dimensions
    const userGoals = profile.skinGoals || [];
    const targetDims: string[] = [];
    if (userGoals.includes('Acne')) targetDims.push('pores', 'oiliness');
    if (userGoals.includes('Brightening')) targetDims.push('tone', 'sun_damage');
    if (userGoals.includes('Anti-aging')) targetDims.push('fine_lines');
    if (userGoals.includes('Hydration')) targetDims.push('hydration');
    if (userGoals.includes('Even tone')) targetDims.push('tone');
    if (userGoals.includes('General health')) targetDims.push('texture');
    
    if (targetDims.length === 0) {
      return FALLBACK_PRODUCTS;
    }
    
    const matched = FALLBACK_PRODUCTS.filter(p => 
      p.dimensions.some(d => targetDims.includes(d))
    );
    
    return matched.length > 0 ? matched : FALLBACK_PRODUCTS;
  };

  const displayProducts = getDisplayProducts();

  const triggerPreviewScreen = (screenId: number) => {
    setIsPreviewActive(true);
    setPreviewScreenId(screenId);
    setPreviewPanelOpen(false);
    
    // Reset all standard interactive modes
    setIsAnalyzing(false);
    setPaywallVisible(false);
    setSelectedPastScan(null);
    setUseCameraActive(false);

    switch (screenId) {
      case 1:
        setOnboardStep('welcome');
        break;
      case 2:
        setOnboardStep('signup_name');
        break;
      case 3:
        setOnboardStep('type');
        break;
      case 4:
        setOnboardStep('goals');
        break;
      case 5:
        setOnboardStep('age');
        break;
      case 6:
        setActiveTab('camera');
        break;
      case 7:
        setIsAnalyzing(true);
        break;
      case 8:
        setActiveTab('insights');
        break;
      case 9:
        setActiveTab('products');
        break;
      case 10:
        setActiveTab('journey');
        break;
      case 11:
        setActiveTab('journey');
        setSelectedPastScan(MOCK_SCANS[0]);
        break;
      case 12:
        setActiveTab('camera');
        setPaywallVisible(true);
        break;
      case 13:
        setActiveTab('profile');
        break;
      default:
        break;
    }
  };

  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'camera' | 'insights' | 'journey' | 'products' | 'profile'>('camera');
  
  // Onboarding & Login states
  const [onboardStep, setOnboardStep] = useState<'welcome' | 'signin' | 'signup_name' | 'type' | 'goals' | 'age'>('welcome');
  const [loginNameInput, setLoginNameInput] = useState('');
  const [onboardName, setOnboardName] = useState('');
  const [onboardAge, setOnboardAge] = useState('26–35');
  const [onboardSkinType, setOnboardSkinType] = useState<string | null>('combination');
  const [onboardGoals, setOnboardGoals] = useState<string[]>([]);

  const handleLogin = async () => {
    if (!loginNameInput.trim()) {
      Alert.alert('Name Required', 'Please enter your registered name to sign in.');
      return;
    }
    try {
      await loginUser(loginNameInput.trim());
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'An error occurred during sign in.');
    }
  };
  
  // Camera & Photo uploads
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [useCameraActive, setUseCameraActive] = useState(false);
  const [savePhotosConsent, setSavePhotosConsent] = useState(false);
  const [cameraGuideModal, setCameraGuideModal] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');

  // Analysis UI states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgressMsg, setAnalysisProgressMsg] = useState('');
  const [analyzingPhotoUri, setAnalyzingPhotoUri] = useState<string | null>(null);
  const [analyzingPhotoIsFront, setAnalyzingPhotoIsFront] = useState(false);
  const [activeStatusIndex, setActiveStatusIndex] = useState(0);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Skincare Weather Forecast States
  const [envContext, setEnvContext] = useState<'outdoor' | 'office' | 'dry'>('outdoor');

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const envData = {
    outdoor: {
      uv: '6 (High)',
      uvColor: '#E29578',
      humidity: '48%',
      aqi: '54 (Moderate)',
      barrierStatus: 'SPF Recommended',
      tip: 'High UV exposure! Reapply broad-spectrum sunscreen every 3 hours.'
    },
    office: {
      uv: '0 (Negligible)',
      uvColor: COLORS.greenSuccess,
      humidity: '32% (Dry)',
      aqi: '22 (Good)',
      barrierStatus: 'Hydration Deficit Risk',
      tip: 'AC air dries out lipids. Mist face or apply a hyaluronic booster to retain hydration.'
    },
    dry: {
      uv: '1 (Low)',
      uvColor: COLORS.greenSuccess,
      humidity: '18% (Arid)',
      aqi: '82 (Moderate)',
      barrierStatus: 'Barrier Stress',
      tip: 'Arid environment strips skin barrier. Apply a nourishing ceramide cream to lock in moisture.'
    }
  };
  
  const statusMessages = [
    'Mapping face geometry...',
    'Analyzing skin hydration levels...',
    'Scanning pore distribution...',
    'Checking tone and pigment spots...',
    'Isolating T-zone sebum indicators...'
  ];
 
  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      setActiveStatusIndex(0);
      interval = setInterval(() => {
        setActiveStatusIndex(prev => (prev + 1) % statusMessages.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);
 
  useEffect(() => {
    if (isAnalyzing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: false,
          })
        ])
      ).start();
 
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
      pulseAnim.setValue(0.4);
    }
  }, [isAnalyzing]);
 
  // Subscription Paywall UI Modal
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [activeDetection, setActiveDetection] = useState<any>(null);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);

  const getMetricStatus = (dimKey: string, score: number) => {
    if (dimKey === 'pores') {
      if (score < 40) return { label: 'Excellent', color: COLORS.greenSuccess, bg: '#EAF5EC' };
      if (score < 70) return { label: 'Moderate', color: COLORS.goldAccent, bg: '#FEF9EB' };
      return { label: 'Enlarged', color: COLORS.roseDark, bg: '#FDF2F2' };
    }
    if (dimKey === 'oiliness') {
      const diff = Math.abs(50 - score);
      if (diff < 10) return { label: 'Balanced', color: COLORS.greenSuccess, bg: '#EAF5EC' };
      if (score > 60) return { label: 'Oily Shine', color: COLORS.roseDark, bg: '#FDF2F2' };
      return { label: 'Dry Sebum', color: COLORS.roseDark, bg: '#FDF2F2' };
    }
    if (score >= 75) return { label: 'Optimal', color: COLORS.greenSuccess, bg: '#EAF5EC' };
    if (score >= 55) return { label: 'Moderate', color: COLORS.goldAccent, bg: '#FEF9EB' };
    return { label: 'Needs Care', color: COLORS.roseDark, bg: '#FDF2F2' };
  };

  const getPrimaryConcern = (scores: ScanScores) => {
    const scoreMap = { ...scores };
    scoreMap.pores = 100 - scores.pores;
    const sorted = Object.keys(scoreMap).sort((a, b) => {
      return scoreMap[a as keyof typeof scoreMap] - scoreMap[b as keyof typeof scoreMap];
    });
    const lowest = sorted[0];
    const labels: Record<string, string> = {
      hydration: 'Moisture Deficit',
      texture: 'Epidermal Roughness',
      pores: 'Follicular Congestion',
      tone: 'Pigmentation & Redness',
      oiliness: 'Sebum Imbalance',
      fine_lines: 'Structural Elasticity Loss',
      sun_damage: 'UV Melanocyte Activity'
    };
    return labels[lowest] || 'General Dermal Care';
  };

  const activeTabIndices: Record<string, number> = {
    camera: 0,
    insights: 1,
    journey: 2,
    products: 3,
    profile: 4
  };

  const tabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: activeTabIndices[activeTab] ?? 0,
      useNativeDriver: true,
      tension: 65,
      friction: 9
    }).start();
  }, [activeTab]);

  useEffect(() => {
    setActiveDetection(null);
  }, [currentScan]);

  // Dimension details helper labels
  const DIMENSION_METADATA = {
    hydration: { label: 'Hydration', icon: '💧', color: '#56A3A6' },
    texture: { label: 'Texture Smoothness', icon: '✨', color: '#B38A5B' },
    pores: { label: 'Pore Visibility', icon: '🔍', color: '#7E6B8F' }, // note: lower = better
    tone: { label: 'Tone Evenness', icon: '🎭', color: '#E29578' },
    oiliness: { label: 'Oiliness Balance', icon: '☀️', color: '#F1A53F' }, // note: balanced is 50
    fine_lines: { label: 'Fine Lines', icon: '🌸', color: '#D291BC' },
    sun_damage: { label: 'Sun Spotting', icon: '⛱️', color: '#C86B6B' }
  };

  useEffect(() => {
    // If user has scan history, default active tab to insights, otherwise camera
    if (profile && scans.length > 0) {
      setActiveTab('insights');
    } else {
      setActiveTab('camera');
    }
  }, [profile, scans.length]);

  const handleStartOnboarding = async () => {
    if (!onboardName.trim()) {
      Alert.alert('Name Required', 'Please enter your name to start personalized skin checks.');
      return;
    }
    await saveProfile(onboardName, onboardAge, onboardSkinType, onboardGoals);
  };

  const handleCameraPermissionRequest = async () => {
    const status = await requestCameraPermission();
    if (status.granted) {
      setUseCameraActive(true);
    } else {
      Alert.alert('Permission Denied', 'Camera access is required to capture photos. You can still select from your gallery.');
    }
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      setAnalysisProgressMsg('Capturing scan photo...');
      setIsAnalyzing(true);
      const isFront = cameraFacing === 'front';
      setAnalyzingPhotoIsFront(isFront);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true
      });
      if (photo) {
        let base64Data = photo.base64;
        if (Platform.OS === 'web' && photo.uri) {
          base64Data = await getBase64FromUri(photo.uri);
        } else if (!base64Data && photo.uri) {
          base64Data = await getBase64FromUri(photo.uri);
        }
        if (base64Data) {
          setUseCameraActive(false);
          setAnalyzingPhotoUri(Platform.OS === 'web' ? 'data:image/jpeg;base64,' + base64Data : photo.uri);
          await uploadAndAnalyze(base64Data, isFront);
        } else {
          throw new Error('No picture data retrieved.');
        }
      }
    } catch (e: any) {
      setIsAnalyzing(false);
      Alert.alert('Capture Error', 'Could not capture image from device: ' + e.message);
    }
  };

  const selectPhotoFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Gallery access is required to upload skin photos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0]) {
        let base64Img = pickerResult.assets[0].base64;
        if (Platform.OS === 'web' && pickerResult.assets[0].uri) {
          setAnalysisProgressMsg('Reading photo file...');
          setIsAnalyzing(true);
          base64Img = await getBase64FromUri(pickerResult.assets[0].uri);
        } else if (!base64Img && pickerResult.assets[0].uri) {
          setAnalysisProgressMsg('Reading photo file...');
          setIsAnalyzing(true);
          base64Img = await getBase64FromUri(pickerResult.assets[0].uri);
        }
        if (base64Img) {
          setAnalyzingPhotoIsFront(false);
          setAnalyzingPhotoUri(Platform.OS === 'web' ? 'data:image/jpeg;base64,' + base64Img : pickerResult.assets[0].uri);
          await uploadAndAnalyze(base64Img, false);
        } else {
          Alert.alert('Gallery Error', 'Selected file has no image data.');
        }
      }
    } catch (e: any) {
      setIsAnalyzing(false);
      Alert.alert('Gallery Error', 'Failed to retrieve image: ' + e.message);
    }
  };

  const openCameraWeb = () => {
    if (typeof document === 'undefined') return;

    let input = document.getElementById('web-camera-input') as HTMLInputElement | null;
    if (!input) {
      input = document.createElement('input');
      input.id = 'web-camera-input';
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'user');
      input.style.display = 'none';
      document.body.appendChild(input);
    }

    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          setAnalysisProgressMsg('Reading camera photo...');
          setIsAnalyzing(true);

          const objectUrl = URL.createObjectURL(file);
          setAnalyzingPhotoIsFront(true);
          setAnalyzingPhotoUri(objectUrl);

          const base64Img = await getBase64FromUri(objectUrl);
          if (base64Img) {
            setAnalyzingPhotoUri('data:image/jpeg;base64,' + base64Img);
            await uploadAndAnalyze(base64Img, true);
          } else {
            Alert.alert('Camera Error', 'Could not read image data.');
            setIsAnalyzing(false);
          }

          URL.revokeObjectURL(objectUrl);
        } catch (err: any) {
          setIsAnalyzing(false);
          Alert.alert('Camera Error', 'Failed to process image: ' + err.message);
        }
      }
    };

    input.click();
  };

  const uploadAndAnalyze = async (base64Img: string, isFront: boolean) => {
    setAnalysisProgressMsg('Uploading securely...');
    setIsAnalyzing(true);
    
    // Check if free scan threshold is exceeded
    if (scans.length >= 1 && subscription.status !== 'active') {
      setIsAnalyzing(false);
      setPaywallVisible(true);
      return;
    }

    try {
      setAnalysisProgressMsg('Analyzing skin dimensions...');
      await submitPhotoForAnalysis(base64Img, savePhotosConsent, isFront);
      setAnalysisProgressMsg('Generating recommendations...');
      setActiveTab('insights');
    } catch (err: any) {
      if (err?.message?.includes('Subscription required') || err?.message?.includes('403')) {
        setPaywallVisible(true);
      } else {
        Alert.alert('Analysis Failed', err?.message || 'Server did not return a valid response. Please retry.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getDeltaString = (dimKey: keyof typeof DIMENSION_METADATA) => {
    if (scans.length < 2) return null;
    const currentVal = scans[0].scores[dimKey];
    const prevVal = scans[1].scores[dimKey];
    const delta = currentVal - prevVal;
    
    if (delta === 0) return { text: 'Stable', color: COLORS.textMuted };
    
    let isImproved = delta > 0;
    if (dimKey === 'pores') {
      // lower pore score is better
      isImproved = delta < 0;
    }

    const direction = isImproved ? 'improved' : 'dropped';
    const arrow = isImproved ? '▲' : '▼';
    const absDelta = Math.abs(delta);

    return {
      text: `${arrow} ${absDelta} pts`,
      color: isImproved ? COLORS.greenSuccess : COLORS.roseDark
    };
  };

  const renderSVGHistoryChart = () => {
    if (scans.length < 2) {
      return (
        <View style={styles.emptyChartContainer}>
          <Text style={styles.emptyChartText}>Analyze skin 2+ times to view trend charts</Text>
        </View>
      );
    }

    // Chart dimensions
    const chartWidth = SCREEN_WIDTH - 60;
    const chartHeight = 160;
    const padding = 25;

    // Show overall scores chronologically (oldest to newest)
    const reversedScans = [...scans].slice(0, 5).reverse();
    const scores = reversedScans.map(s => s.scores.overall);
    const dates = reversedScans.map(s => {
      const d = new Date(s.createdAt);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });

    const maxScore = 100;
    const minScore = 40; // minimum scale baseline
    const scoreRange = maxScore - minScore;

    const points = scores.map((score, index) => {
      const x = padding + (index * (chartWidth - padding * 2)) / (scores.length - 1);
      const y = chartHeight - padding - ((score - minScore) * (chartHeight - padding * 2)) / scoreRange;
      return { x, y, score, label: dates[index] };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
    }

    return (
      <View style={styles.chartContainer}>
        <View style={{ height: chartHeight, width: chartWidth, position: 'relative' }}>
          {/* Custom SVG Drawing using views / absolute coordinates */}
          {/* Grid lines */}
          <View style={[styles.gridLine, { top: padding }]} />
          <View style={[styles.gridLine, { top: chartHeight / 2 }]} />
          <View style={[styles.gridLine, { top: chartHeight - padding }]} />
          
          {/* Drawing Line Path using absolute views for cross-platform visual consistency */}
          {points.map((p, idx) => {
            return (
              <React.Fragment key={idx}>
                {/* Score Dot */}
                <View style={[styles.chartDot, { left: p.x - 6, top: p.y - 6 }]} />
                {/* Score Text */}
                <Text style={[styles.chartValueLabel, { left: p.x - 12, top: p.y - 22 }]}>{p.score}</Text>
                {/* Date Label */}
                <Text style={[styles.chartDateLabel, { left: p.x - 15, top: chartHeight - 16 }]}>{p.label}</Text>
              </React.Fragment>
            );
          })}
          
          {/* Connecting line overlays */}
          {points.slice(0, -1).map((p, idx) => {
            const nextP = points[idx + 1];
            const dx = nextP.x - p.x;
            const dy = nextP.y - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            return (
              <View
                key={`line-${idx}`}
                style={[
                  styles.chartLine,
                  {
                    left: p.x,
                    top: p.y,
                    width: distance,
                    transform: [{ rotate: `${angle}rad` }],
                    transformOrigin: '0% 0%'
                  }
                ]}
              />
            );
          })}
        </View>
      </View>
    );
  };

  const renderScanDetailPopup = () => {
    if (!selectedPastScan) return null;

    return (
      <View style={[StyleSheet.absoluteFillObject, { zIndex: 999998, backgroundColor: COLORS.bgLight }]}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header Row */}
          <View style={styles.detailHeaderRow}>
            <TouchableOpacity 
              style={styles.previewPanelCloseBtn} 
              onPress={() => setSelectedPastScan(null)}
            >
              <Text style={{ fontSize: 16, color: COLORS.textDark, fontWeight: 'bold' }}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>Scan Details</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 20 }]}>
            {/* Date Indicator */}
            <View style={styles.detailTopCard}>
              <Text style={styles.detailDateText}>
                {new Date(selectedPastScan.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </Text>
              <Text style={styles.detailTimeText}>
                {new Date(selectedPastScan.createdAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>

            {/* Score Gauge Circle */}
            <View style={styles.insightsGaugeCard}>
              <View style={styles.gaugeOuterRing}>
                <LinearGradient
                  colors={[COLORS.rosePrimary, '#FFF']}
                  style={styles.gaugeInnerRing}
                >
                  <View style={styles.gaugeCenterWhite}>
                    <Text style={styles.gaugeScoreBig}>{selectedPastScan.scores.overall}</Text>
                    <Text style={styles.gaugeScoreLabelText}>Overall Score</Text>
                  </View>
                </LinearGradient>
              </View>
            </View>

            {/* Pros/Cons Summary Card */}
            <View style={styles.prosConsCard}>
              {/* Left: Strengths */}
              <View style={styles.prosConsColumn}>
                <Text style={[styles.prosConsHeader, { color: COLORS.greenSuccess }]}>Strengths</Text>
                <Text style={styles.prosConsBullet}>• {selectedPastScan.scores.hydration >= 60 ? 'Healthy moisture' : 'Strong barrier'}</Text>
                <Text style={styles.prosConsBullet}>• {selectedPastScan.scores.pores < 50 ? 'Refined pores' : 'Vibrant skin tone'}</Text>
              </View>
              <View style={styles.prosConsDivider} />
              {/* Right: Watch out */}
              <View style={styles.prosConsColumn}>
                <Text style={[styles.prosConsHeader, { color: COLORS.goldAccent }]}>Watch out</Text>
                <Text style={styles.prosConsBullet}>• {selectedPastScan.scores.hydration < 60 ? 'Cheek dehydration' : 'T-zone shine'}</Text>
                <Text style={styles.prosConsBullet}>• {selectedPastScan.scores.pores >= 50 ? 'Nasal pore shadows' : 'UV spotting risk'}</Text>
              </View>
            </View>

            <Text style={styles.sectionHeaderTitle}>Skin Dimension Breakdowns</Text>

            {/* 7 Dimension Cards */}
            {Object.keys(DIMENSION_METADATA).map(dimKey => {
              const score = selectedPastScan.scores[dimKey as keyof ScanScores];
              const explanation = selectedPastScan.explanations[dimKey as keyof ScanExplanations];
              const metadata = DIMENSION_METADATA[dimKey as keyof typeof DIMENSION_METADATA];
              const status = getMetricStatus(dimKey, score);
              const isExpanded = expandedDim === dimKey;

              return (
                <TouchableOpacity
                  key={dimKey}
                  activeOpacity={0.9}
                  style={styles.dimensionCard}
                  onPress={() => setExpandedDim(isExpanded ? null : dimKey)}
                >
                  <View style={styles.dimHeaderRow}>
                    <View style={styles.dimTitleCol}>
                      <Text style={styles.dimIcon}>{metadata.icon}</Text>
                      <Text style={styles.dimName}>{metadata.label}</Text>
                    </View>
                    <View style={styles.dimScoreColRight}>
                      <View style={[styles.dimScoreBadge, { backgroundColor: metadata.color }]}>
                        <Text style={styles.dimScoreText}>{score}/100</Text>
                      </View>
                      <Text style={styles.chevronIcon}>{isExpanded ? '▲' : '▼'}</Text>
                    </View>
                  </View>

                  <View style={styles.dimSubHeaderRow}>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>

                  <View style={styles.metricProgressBg}>
                    <View style={[styles.metricProgressFill, { width: `${score}%`, backgroundColor: COLORS.rosePrimary }]} />
                  </View>

                  {isExpanded ? (
                    <View style={styles.expandedContentBlock}>
                      <Text style={styles.dimExplanation}>{explanation}</Text>
                      <View style={styles.cardDivider} />
                      <View style={styles.ingredientsRow}>
                        <Text style={styles.ingredientsTitle}>🔬 Key Actives:</Text>
                        <Text style={styles.ingredientsValue}>{dimIngredients[dimKey]}</Text>
                      </View>
                      <View style={styles.actionRow}>
                        <Text style={styles.actionTitle}>⚡ Action Plan:</Text>
                        <Text style={styles.actionValue}>{dimActions[dimKey]}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.tapToExpandText}>Tap card to review clinical analysis & actives plan</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  };

  const renderDesignPreviewPanel = () => {
    return (
      <>
        {/* Floating Toggle Button */}
        <TouchableOpacity 
          style={styles.floatingPreviewToggle}
          onPress={() => setPreviewPanelOpen(prev => !prev)}
        >
          <Text style={{ fontSize: 20 }}>✨</Text>
          <Text style={styles.floatingPreviewToggleText}>Inspect</Text>
        </TouchableOpacity>

        {/* Panel View Overlay instead of Modal */}
        {previewPanelOpen && (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 999999 }]}>
            <TouchableOpacity 
              activeOpacity={1}
              style={styles.previewPanelModalOverlay}
              onPress={() => setPreviewPanelOpen(false)}
            >
              <View 
                style={styles.previewPanelModalContent}
                onStartShouldSetResponder={() => true}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <View style={styles.previewPanelHeader}>
                  <Text style={styles.previewPanelTitle}>✨ Screen Inspector</Text>
                  <TouchableOpacity 
                    style={styles.previewPanelCloseBtn}
                    onPress={() => setPreviewPanelOpen(false)}
                  >
                    <Text style={{ fontSize: 16, color: COLORS.textDark, fontWeight: 'bold' }}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.previewPanelScroll}>
                  <TouchableOpacity 
                    style={[styles.previewScreenBtn, !isPreviewActive && styles.previewScreenBtnActive]}
                    onPress={() => {
                      setIsPreviewActive(false);
                      setPreviewScreenId(null);
                      setIsAnalyzing(false);
                      setPaywallVisible(false);
                      setSelectedPastScan(null);
                      setPreviewPanelOpen(false);
                    }}
                  >
                    <Text style={[styles.previewScreenBtnText, !isPreviewActive && { color: '#FFF' }]}>
                      🟢 Live Mode (Interactive)
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.previewSeparator} />

                  {[
                    { id: 1, name: '1. Splash / Welcome' },
                    { id: 2, name: '2. Login/Register: Name' },
                    { id: 3, name: '3. Onboarding: Skin Type' },
                    { id: 4, name: '4. Onboarding: Skin Goals' },
                    { id: 5, name: '5. Onboarding: Age Range' },
                    { id: 6, name: '6. Camera Capture Viewfinder' },
                    { id: 7, name: '7. Analysis Loading Spinner' },
                    { id: 8, name: '8. Insights / Skin Results' },
                    { id: 9, name: '9. Recommendations / Remedies' },
                    { id: 10, name: '10. Skin Journey Trend Chart' },
                    { id: 11, name: '11. Scan Detail Comparison' },
                    { id: 12, name: '12. Subscription Paywall' },
                    { id: 13, name: '13. Settings / User Profile' }
                  ].map(screen => {
                    const isCurrent = isPreviewActive && previewScreenId === screen.id;
                    return (
                      <TouchableOpacity
                        key={screen.id}
                        style={[styles.previewScreenBtn, isCurrent && styles.previewScreenBtnActive]}
                        onPress={() => {
                          triggerPreviewScreen(screen.id);
                          setPreviewPanelOpen(false);
                        }}
                      >
                        <Text style={[styles.previewScreenBtnText, isCurrent && { color: '#FFF', fontWeight: 'bold' }]}>
                          {screen.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

  // Onboarding screens (if profile is null)
  if (!profile) {
    const goalsList = [
      { id: 'Acne', label: 'Acne & Congestion', icon: '🔍' },
      { id: 'Brightening', label: 'Brightening', icon: '✨' },
      { id: 'Anti-aging', label: 'Anti-aging', icon: '🌸' },
      { id: 'Hydration', label: 'Hydration', icon: '💧' },
      { id: 'Even tone', label: 'Even tone', icon: '🎭' },
      { id: 'General health', label: 'General health', icon: '🛡️' }
    ];

    const toggleGoal = (goalId: string) => {
      if (onboardGoals.includes(goalId)) {
        setOnboardGoals(onboardGoals.filter(g => g !== goalId));
      } else {
        setOnboardGoals([...onboardGoals, goalId]);
      }
    };

    const renderProgressBar = (step: number) => {
      const pct = step === 1 ? '33%' : step === 2 ? '66%' : '100%';
      return (
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: pct }]} />
          <Text style={styles.progressBarText}>Step {step} of 3</Text>
        </View>
      );
    };

    // Screen 1: Splash / Welcome
    if (onboardStep === 'welcome') {
      return (
        <SafeAreaView style={[styles.onboardContainer, { backgroundColor: COLORS.bgLight }]}>
          <View style={styles.splashContent}>
            {/* DermaAI Logo & Wordmark */}
            <View style={styles.logoBadgeContainer}>
              <View style={styles.logoBadgeCircle}>
                <Text style={{ fontSize: 36 }}>🌿</Text>
              </View>
              <Text style={styles.splashLogoText}>DermaAI</Text>
            </View>
            
            <Text style={styles.splashTagline}>Know your skin. Transform it.</Text>
            
            <TouchableOpacity 
              style={[styles.splashCTA, { backgroundColor: COLORS.rosePrimary, marginTop: 40 }]} 
              onPress={() => setOnboardStep('signup_name')}
            >
              <Text style={styles.splashCTAText}>Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.splashLink} 
              onPress={() => setOnboardStep('signin')}
            >
              <Text style={styles.splashLinkText}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          </View>
          {renderDesignPreviewPanel()}
        </SafeAreaView>
      );
    }

    // Screen 2: signup_name (New User Enter Name)
    if (onboardStep === 'signup_name') {
      return (
        <SafeAreaView style={[styles.onboardContainer, { backgroundColor: COLORS.bgLight }]}>
          <View style={styles.splashContent}>
            <Text style={styles.onboardHeading}>Create Account</Text>
            <Text style={styles.onboardSubheading}>First, tell us your name to begin your skincare analysis.</Text>
            
            <View style={styles.splashInputWrapper}>
              <Text style={styles.splashInputLabel}>What should we call you?</Text>
              <TextInput
                style={styles.splashTextInput}
                value={onboardName}
                onChangeText={setOnboardName}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>

            <TouchableOpacity 
              style={[styles.splashCTA, { backgroundColor: COLORS.rosePrimary }]} 
              onPress={() => {
                if (!onboardName.trim()) {
                  Alert.alert('Name Required', 'Please tell us your name to personalize your skincare journey.');
                  return;
                }
                setOnboardStep('type');
              }}
            >
              <Text style={styles.splashCTAText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.splashLink} 
              onPress={() => setOnboardStep('welcome')}
            >
              <Text style={styles.splashLinkText}>Back to welcome</Text>
            </TouchableOpacity>
          </View>
          {renderDesignPreviewPanel()}
        </SafeAreaView>
      );
    }

    // Sign In View
    if (onboardStep === 'signin') {
      return (
        <SafeAreaView style={[styles.onboardContainer, { backgroundColor: COLORS.bgLight }]}>
          <View style={styles.splashContent}>
            <Text style={styles.onboardHeading}>Welcome Back</Text>
            <Text style={styles.onboardSubheading}>Sign in with your registered name to restore your journey.</Text>
            
            <View style={styles.splashInputWrapper}>
              <Text style={styles.splashInputLabel}>Registered Name</Text>
              <TextInput
                style={styles.splashTextInput}
                value={loginNameInput}
                onChangeText={setLoginNameInput}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>

            <TouchableOpacity 
              style={[styles.splashCTA, { backgroundColor: COLORS.rosePrimary }]} 
              onPress={handleLogin}
            >
              <Text style={styles.splashCTAText}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.splashLink} 
              onPress={() => setOnboardStep('welcome')}
            >
              <Text style={styles.splashLinkText}>Back to welcome</Text>
            </TouchableOpacity>
          </View>
          {renderDesignPreviewPanel()}
        </SafeAreaView>
      );
    }

    // Screen 2: Onboarding - Skin Type
    if (onboardStep === 'type') {
      const typeList = [
        { id: 'oily', label: 'Oily', desc: 'Excess sebum, shiny T-zone, enlarged pores', icon: '💧' },
        { id: 'dry', label: 'Dry', desc: 'Tightness, flaking, dullness, needs hydration', icon: '🌵' },
        { id: 'combination', label: 'Combination', desc: 'Oily T-zone, dry/normal cheeks', icon: '🎭' },
        { id: 'sensitive', label: 'Sensitive', desc: 'Redness, irritation, reacts to actives', icon: '🌸' }
      ];

      return (
        <SafeAreaView style={[styles.onboardContainer, { backgroundColor: COLORS.bgLight }]}>
          <ScrollView contentContainerStyle={styles.onboardScroll}>
            {renderProgressBar(1)}
            <Text style={styles.onboardHeading}>What's your skin type?</Text>
            <Text style={styles.onboardSubheading}>We'll personalise your analysis.</Text>

            <View style={styles.typeGrid}>
              {typeList.map((item) => {
                const isSelected = onboardSkinType === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.9}
                    style={[styles.typeCard, isSelected && styles.typeCardSelected]}
                    onPress={() => setOnboardSkinType(item.id)}
                  >
                    <Text style={styles.typeCardIcon}>{item.icon}</Text>
                    <Text style={styles.typeCardLabel}>{item.label}</Text>
                    <Text style={styles.typeCardDesc}>{item.desc}</Text>
                    {isSelected && (
                      <View style={styles.typeCheckBadge}>
                        <Text style={styles.typeCheckText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity 
              style={[styles.primaryButton, { backgroundColor: COLORS.rosePrimary }]} 
              onPress={() => setOnboardStep('goals')}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </ScrollView>
          {renderDesignPreviewPanel()}
        </SafeAreaView>
      );
    }

    // Screen 3: Onboarding - Skin Goals
    if (onboardStep === 'goals') {
      return (
        <SafeAreaView style={[styles.onboardContainer, { backgroundColor: COLORS.bgLight }]}>
          <ScrollView contentContainerStyle={styles.onboardScroll}>
            {renderProgressBar(2)}
            <Text style={styles.onboardHeading}>What are your skin goals?</Text>
            <Text style={styles.onboardSubheading}>Pick all that apply.</Text>

            <View style={styles.goalsPillWrapper}>
              {goalsList.map((goal) => {
                const isSelected = onboardGoals.includes(goal.id);
                return (
                  <TouchableOpacity
                    key={goal.id}
                    style={[styles.goalPill, isSelected && styles.goalPillSelected]}
                    onPress={() => toggleGoal(goal.id)}
                  >
                    <Text style={[styles.goalPillText, isSelected && styles.goalPillTextSelected]}>
                      {goal.icon} {goal.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity 
              style={[styles.primaryButton, { backgroundColor: COLORS.rosePrimary }]} 
              onPress={() => setOnboardStep('age')}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </ScrollView>
          {renderDesignPreviewPanel()}
        </SafeAreaView>
      );
    }

    // Screen 4: Onboarding - Age Range
    if (onboardStep === 'age') {
      const ageGroups = ['Under 18', '18–25', '26–35', '36–45', '45+'];

      return (
        <SafeAreaView style={[styles.onboardContainer, { backgroundColor: COLORS.bgLight }]}>
          <ScrollView contentContainerStyle={styles.onboardScroll}>
            {renderProgressBar(3)}
            <Text style={styles.onboardHeading}>Your age range?</Text>

            <View style={styles.ageListContainer}>
              {ageGroups.map((age) => {
                const isSelected = onboardAge === age;
                return (
                  <TouchableOpacity
                    key={age}
                    activeOpacity={0.8}
                    style={[styles.ageRowCard, isSelected && styles.ageRowCardSelected]}
                    onPress={() => setOnboardAge(age)}
                  >
                    <Text style={styles.ageRowText}>{age}</Text>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleChecked]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity 
              style={[styles.primaryButton, { backgroundColor: COLORS.rosePrimary, marginTop: 40 }]} 
              onPress={handleStartOnboarding}
            >
              <Text style={styles.primaryButtonText}>Start my skin journey →</Text>
            </TouchableOpacity>
          </ScrollView>
          {renderDesignPreviewPanel()}
        </SafeAreaView>
      );
    }
  }

  // Screen 6: Analysis Loading
  if (isAnalyzing) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: COLORS.bgLight }]}>
        <View style={styles.loadingInnerContent}>
          {/* Animated Circular Progress Ring with Silhouette Icon */}
          <View style={styles.loadingRingWrapper}>
            <Animated.View 
              style={[
                styles.loadingRingOuter,
                {
                  transform: [{
                    rotate: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg']
                    })
                  }]
                }
              ]}
            >
              <LinearGradient
                colors={[COLORS.rosePrimary, '#FAFAF8']}
                style={styles.loadingRingGradient}
              />
            </Animated.View>
            <View style={styles.loadingRingSilhouette}>
              <Text style={{ fontSize: 44 }}>👤</Text>
            </View>
          </View>

          <Text style={styles.loadingMainTitle}>Analysing your skin...</Text>

          {/* Sequential Status Lines */}
          <View style={styles.statusLinesList}>
            <Text style={[styles.statusLineItem, { opacity: 1 }]}>
              ✓ Reading hydration levels
            </Text>
            <Text style={[styles.statusLineItem, { opacity: activeStatusIndex >= 1 ? 1 : 0.3 }]}>
              {activeStatusIndex >= 1 ? '✓' : '•'} Mapping texture & tone
            </Text>
            <Text style={[styles.statusLineItem, { opacity: activeStatusIndex >= 2 ? 1 : 0.3 }]}>
              {activeStatusIndex >= 2 ? '✓' : '•'} Building your skin profile
            </Text>
          </View>

          {/* Bottom Disclaimer */}
          <Text style={styles.loadingDisclaimer}>
            Cosmetic assessment only — not a medical diagnosis.
          </Text>
        </View>
        {renderDesignPreviewPanel()}
      </SafeAreaView>
    );
  }

  const tabWidth = SCREEN_WIDTH / 5;
  const translateX = tabAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [
      8,
      tabWidth + 8,
      tabWidth * 2 + 8,
      tabWidth * 3 + 8,
      tabWidth * 4 + 8
    ]
  });

  return (
    <LinearGradient
      colors={['#FFF5F7', '#FAFAF8']}
      style={styles.container}
    >
      {/* Screen 10 details popup */}
      {renderScanDetailPopup()}

      {/* Dynamic Header on main screens */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.headerLogo}>DermaAI</Text>
              <Text style={styles.headerWelcome}>Hello, {profile.name}</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={[
              styles.subscriptionBadge, 
              subscription.status === 'active' ? styles.badgeActive : styles.badgeFree
            ]}
            onPress={() => {
              if (subscription.status !== 'active') setPaywallVisible(true);
            }}
          >
            <Text style={[styles.badgeText, subscription.status === 'active' && { color: COLORS.rosePrimary }]}>
              {subscription.status === 'active' ? 'PRO MEMBER' : 'FREE ACCOUNT'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Main Tab Screen Switcher */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* SCAN TAB (Screen 5) */}
        {activeTab === 'camera' && (
          <View style={{ padding: 0 }}>
            {useCameraActive && cameraPermission && cameraPermission.granted ? (
              <View style={styles.cameraBoxContainer}>
                <CameraView ref={cameraRef} facing={cameraFacing} style={StyleSheet.absoluteFillObject}>
                  {/* Face guide overlay */}
                  <View style={styles.overlayGuideContainer}>
                    <View style={styles.overlayGuideCutout} />
                    <Text style={styles.cameraOverlayTip}>Position face inside guide</Text>
                  </View>
                </CameraView>
                
                {/* Capture button controls */}
                <View style={styles.cameraControlsRow}>
                  <TouchableOpacity style={styles.secondaryRoundBtn} onPress={() => setUseCameraActive(false)}>
                    <Text style={styles.btnIcon}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.captureButtonOuter} onPress={capturePhoto}>
                    <View style={styles.captureButtonInner} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.secondaryRoundBtn} 
                    onPress={() => setCameraFacing(prev => prev === 'front' ? 'back' : 'front')}
                  >
                    <Text style={styles.btnIcon}>🔄</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Screen 5: Camera Viewfinder (Simulated on Web, or launcher on Native)
              <View style={styles.darkCameraViewfinder}>
                {/* Viewfinder simulated crop background */}
                <View style={styles.viewfinderDarkBackground}>
                  {/* Glowing Pulse Oval Guide */}
                  <View style={styles.ovalGuideViewfinder} />
                  
                  {/* Top Bar controls */}
                  <View style={styles.viewfinderTopControls}>
                    <TouchableOpacity style={styles.viewfinderControlBtn} onPress={() => setActiveTab('insights')}>
                      <Text style={styles.viewfinderControlIcon}>✕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.viewfinderControlBtn} onPress={() => Alert.alert('Flash', 'Flash toggle triggered.')}>
                      <Text style={styles.viewfinderControlIcon}>⚡</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Floating Tip Pill */}
                  <View style={styles.floatingTipPill}>
                    <Text style={styles.floatingTipText}>Face a window  ·  No filters  ·  Natural light</Text>
                  </View>

                  {/* Bottom Controls */}
                  <View style={styles.viewfinderBottomRow}>
                    {/* Last Scan Thumbnail */}
                    <TouchableOpacity 
                      style={styles.lastScanThumbBtn}
                      onPress={() => {
                        if (scans.length > 0) {
                          setSelectedPastScan(scans[0]);
                        } else {
                          Alert.alert('No Scan', 'Complete a skin scan first.');
                        }
                      }}
                    >
                      {scans.length > 0 && lastScanImageBase64 ? (
                        <Image source={{ uri: lastScanImageBase64 }} style={styles.lastScanThumbImg} />
                      ) : (
                        <View style={[styles.lastScanThumbImg, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 16 }}>👤</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Circular Capture Button */}
                    <TouchableOpacity 
                      style={styles.circularCaptureBtnOuter}
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          openCameraWeb();
                        } else {
                          setUseCameraActive(true);
                        }
                      }}
                    >
                      <View style={styles.circularCaptureBtnInner} />
                    </TouchableOpacity>

                    {/* Spacer to balance last scan thumbnail */}
                    <View style={styles.lastScanThumbBtnPlaceholder} />
                  </View>

                  {/* Upload photo instead link */}
                  <TouchableOpacity 
                    style={styles.uploadInsteadBtn}
                    onPress={selectPhotoFromGallery}
                  >
                    <Text style={styles.uploadInsteadText}>Upload photo instead</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* INSIGHTS TAB (Screen 7) */}
        {activeTab === 'insights' && (
          <View style={styles.tabContentContainer}>
            {realScans.length === 0 && (
              <View style={styles.mockDataBanner}>
                <Text style={styles.mockDataBannerText}>
                  ✨ Showing sample profile. Tap Scan to analyze your own skin!
                </Text>
              </View>
            )}
            {scans.length > 0 && currentScan ? (
              <View>
                {/* Score Gauge Circle */}
                <View style={styles.insightsGaugeCard}>
                  <View style={styles.gaugeOuterRing}>
                    <LinearGradient
                      colors={[COLORS.rosePrimary, '#FFF']}
                      style={styles.gaugeInnerRing}
                    >
                      <View style={styles.gaugeCenterWhite}>
                        <Text style={styles.gaugeScoreBig}>{currentScan.scores.overall}</Text>
                        <Text style={styles.gaugeScoreLabelText}>Your Skin Score</Text>
                      </View>
                    </LinearGradient>
                  </View>

                  {/* Delta Badge Pill */}
                  {scans.length > 1 && (
                    <View style={styles.deltaBadgePill}>
                      <Text style={styles.deltaBadgeText}>
                        {avgImprovement >= 0 ? `+${avgImprovement}` : avgImprovement} pts since last scan
                      </Text>
                    </View>
                  )}
                </View>

                {/* Pros/Cons Summary Card */}
                <View style={styles.prosConsCard}>
                  {/* Left: Strengths */}
                  <View style={styles.prosConsColumn}>
                    <Text style={[styles.prosConsHeader, { color: COLORS.greenSuccess }]}>Strengths</Text>
                    <Text style={styles.prosConsBullet}>• {currentScan.scores.hydration >= 60 ? 'Healthy moisture levels' : 'Strong barrier'}</Text>
                    <Text style={styles.prosConsBullet}>• {currentScan.scores.pores < 50 ? 'Refined pore visibility' : 'Vibrant skin tone'}</Text>
                  </View>
                  <View style={styles.prosConsDivider} />
                  {/* Right: Watch out */}
                  <View style={styles.prosConsColumn}>
                    <Text style={[styles.prosConsHeader, { color: COLORS.goldAccent }]}>Watch out</Text>
                    <Text style={styles.prosConsBullet}>• {currentScan.scores.hydration < 60 ? 'Cheek dehydration' : 'T-zone shine'}</Text>
                    <Text style={styles.prosConsBullet}>• {currentScan.scores.pores >= 50 ? 'Nasal pore shadows' : 'UV spotting risk'}</Text>
                  </View>
                </View>

                <Text style={styles.sectionHeaderTitle}>Skin Dimension Breakdowns</Text>
                
                {/* 7 Dimension Cards */}
                {Object.keys(DIMENSION_METADATA).map(dimKey => {
                  const score = currentScan.scores[dimKey as keyof ScanScores];
                  const explanation = currentScan.explanations[dimKey as keyof ScanExplanations];
                  const metadata = DIMENSION_METADATA[dimKey as keyof typeof DIMENSION_METADATA];
                  const status = getMetricStatus(dimKey, score);
                  const isExpanded = expandedDim === dimKey;

                  return (
                    <TouchableOpacity
                      key={dimKey}
                      activeOpacity={0.9}
                      style={styles.dimensionCard}
                      onPress={() => setExpandedDim(isExpanded ? null : dimKey)}
                    >
                      <View style={styles.dimHeaderRow}>
                        <View style={styles.dimTitleCol}>
                          <Text style={styles.dimIcon}>{metadata.icon}</Text>
                          <Text style={styles.dimName}>{metadata.label}</Text>
                        </View>
                        <View style={styles.dimScoreColRight}>
                          <View style={[styles.dimScoreBadge, { backgroundColor: metadata.color }]}>
                            <Text style={styles.dimScoreText}>{score}/100</Text>
                          </View>
                          <Text style={styles.chevronIcon}>{isExpanded ? '▲' : '▼'}</Text>
                        </View>
                      </View>

                      <View style={styles.dimSubHeaderRow}>
                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                        </View>
                      </View>

                      {/* Rose to Amber Progress Bar */}
                      <View style={styles.metricProgressBg}>
                        <View style={[styles.metricProgressFill, { width: `${score}%`, backgroundColor: COLORS.rosePrimary }]} />
                      </View>

                      {isExpanded ? (
                        <View style={styles.expandedContentBlock}>
                          <Text style={styles.dimExplanation}>{explanation}</Text>
                          <View style={styles.cardDivider} />
                          <View style={styles.ingredientsRow}>
                            <Text style={styles.ingredientsTitle}>🔬 Key Actives:</Text>
                            <Text style={styles.ingredientsValue}>{dimIngredients[dimKey]}</Text>
                          </View>
                          <View style={styles.actionRow}>
                            <Text style={styles.actionTitle}>⚡ Action Plan:</Text>
                            <Text style={styles.actionValue}>{dimActions[dimKey]}</Text>
                          </View>
                          <TouchableOpacity 
                            style={styles.cardActionLink}
                            onPress={() => setActiveTab('products')}
                          >
                            <Text style={styles.cardActionLinkText}>View Products 🧴 →</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={styles.tapToExpandText}>Tap card to review clinical analysis & actives plan</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateTitle}>No Analysis Data Yet</Text>
                <Text style={styles.emptyStateText}>Take your first scan check in the Scan tab to generate insights.</Text>
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: COLORS.rosePrimary }]} onPress={() => setActiveTab('camera')}>
                  <Text style={styles.primaryButtonText}>Scan My Skin Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* RECOMMENDATIONS TAB (Screen 8) */}
        {activeTab === 'products' && (
          <View style={styles.tabContentContainer}>
            <Text style={styles.tabTitle}>Recommendations</Text>
            <Text style={styles.tabSubtitle}>Personalised routines curated for your target skin concerns.</Text>

            {/* Section 1: Products For You */}
            <Text style={styles.sectionHeaderTitle}>Products for you</Text>
            {displayProducts.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalProductsScroll}
              >
                {displayProducts.map(prod => {
                  const primaryDim = prod.dimensions[0];
                  const dimMeta = DIMENSION_METADATA[primaryDim as keyof typeof DIMENSION_METADATA];

                  return (
                    <View key={prod.id} style={styles.recomProductCard}>
                      <View style={styles.recomProductBadgeContainer}>
                        <Text style={[styles.recomProductBadge, { backgroundColor: dimMeta?.color || COLORS.rosePrimary }]}>
                          For: {dimMeta?.label || 'Skincare'}
                        </Text>
                      </View>
                      
                      <Image source={{ uri: prod.image_url }} style={styles.recomProductImage} />
                      
                      <Text style={styles.recomProductBrand}>{prod.brand}</Text>
                      <Text style={styles.recomProductName} numberOfLines={1}>{prod.name}</Text>
                      <Text style={styles.recomProductPrice}>₹{prod.price_inr}</Text>
                      
                      <TouchableOpacity
                        style={[styles.recomCTAButton, { backgroundColor: COLORS.rosePrimary }]}
                        onPress={async () => {
                          await trackProductClick(prod.id);
                          Alert.alert('Shop Redirect', `Redirecting to purchase ${prod.name}...`);
                        }}
                      >
                        <Text style={styles.recomCTAText}>View →</Text>
                      </TouchableOpacity>
                      <Text style={styles.recomDisclosure}>*Affiliate link</Text>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>No products matching your skin type and goals could be loaded.</Text>
              </View>
            )}

            {/* Section 2: Home Remedies */}
            <Text style={[styles.sectionHeaderTitle, { marginTop: 24 }]}>Home remedies</Text>
            <View style={styles.remediesList}>
              {HOME_REMEDIES.map((remedy, idx) => (
                <View key={idx} style={styles.remedyRowCard}>
                  <View style={styles.remedyHeader}>
                    <Text style={styles.remedyNameText}>{remedy.name}</Text>
                    <View style={styles.remedyTagPill}>
                      <Text style={styles.remedyTagText}>{remedy.dimension}</Text>
                    </View>
                  </View>
                  <Text style={styles.remedyInstruction}>{remedy.instruction}</Text>
                  <View style={styles.naturalBadge}>
                    <Text style={styles.naturalBadgeText}>{remedy.tag}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* SKIN JOURNEY / HISTORY TAB (Screen 9) */}
        {activeTab === 'journey' && (
          <View style={styles.tabContentContainer}>
            <Text style={styles.tabTitle}>Your Skin Journey</Text>
            <Text style={styles.tabSubtitle}>Track overall trend changes and score variations across scans.</Text>

            <Text style={styles.sectionHeaderTitle}>Overall Health Trend</Text>
            {renderSVGHistoryChart()}

            <Text style={[styles.sectionHeaderTitle, { marginTop: 24 }]}>Past scans</Text>
            {scans.length > 0 ? (
              <View style={styles.timelineList}>
                {scans.map((scan, idx) => {
                  const dateStr = new Date(scan.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short'
                  });
                  
                  // Compute delta compared to the subsequent scan chronologically
                  let deltaText = 'Baseline';
                  let isPositive = true;
                  const nextScan = scans[idx + 1];
                  if (nextScan) {
                    const diff = scan.scores.overall - nextScan.scores.overall;
                    deltaText = diff >= 0 ? `+${diff} pts` : `${diff} pts`;
                    isPositive = diff >= 0;
                  }

                  return (
                    <TouchableOpacity
                      key={scan.id}
                      activeOpacity={0.8}
                      style={styles.timelineRowCard}
                      onPress={() => setSelectedPastScan(scan)}
                    >
                      <View style={styles.timelineThumbFrame}>
                        {scan.imageUrl ? (
                          <Image source={{ uri: scan.imageUrl }} style={styles.timelineThumbImage} />
                        ) : (
                          <View style={[styles.timelineThumbImage, { backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 16 }}>👤</Text>
                          </View>
                        )}
                        <BlurView intensity={30} style={StyleSheet.absoluteFillObject} />
                      </View>

                      <View style={styles.timelineInfoCol}>
                        <Text style={styles.timelineDateText}>{dateStr}</Text>
                        <Text style={styles.timelineLabelText}>Scan #{scans.length - idx}</Text>
                      </View>

                      <View style={styles.timelineBadgeCol}>
                        <View style={styles.timelineScoreBadge}>
                          <Text style={styles.timelineScoreText}>{scan.scores.overall}</Text>
                        </View>
                        <View style={[
                          styles.timelineDeltaBadge,
                          { backgroundColor: deltaText === 'Baseline' ? COLORS.border : isPositive ? '#EAF5EC' : '#FDF2F2' }
                        ]}>
                          <Text style={[
                            styles.timelineDeltaText,
                            { color: deltaText === 'Baseline' ? COLORS.textDark : isPositive ? COLORS.greenSuccess : COLORS.rosePrimary }
                          ]}>
                            {deltaText}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.timelineChevron}>➔</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>Complete your first scan to begin compiling history timeline.</Text>
              </View>
            )}
          </View>
        )}

        {/* PROFILE/SETTINGS TAB (Screen 12) */}
        {activeTab === 'profile' && (
          <View style={styles.tabContentContainer}>
            <Text style={styles.tabTitle}>Account & Settings</Text>

            {/* Profile Avatar & Badge */}
            <View style={styles.profileAvatarCard}>
              <View style={styles.profileAvatarBig}>
                <Text style={styles.profileAvatarTextBig}>{profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}</Text>
              </View>
              <Text style={styles.profileNameBig}>{profile.name}</Text>
              <View style={[styles.profileProBadge, { backgroundColor: COLORS.rosePrimary }]}>
                <Text style={styles.profileProText}>Pro Member</Text>
              </View>
            </View>

            {/* Statistics Row */}
            <View style={styles.profileStatsRow}>
              <View style={styles.profileStatBox}>
                <Text style={styles.profileStatNumber}>{totalScans}</Text>
                <Text style={styles.profileStatLabel}>Total Scans</Text>
              </View>
              <View style={styles.profileStatDivider} />
              <View style={styles.profileStatBox}>
                <Text style={styles.profileStatNumber}>{daysTracking}</Text>
                <Text style={styles.profileStatLabel}>Days Tracking</Text>
              </View>
              <View style={styles.profileStatDivider} />
              <View style={styles.profileStatBox}>
                <Text style={styles.profileStatNumber}>{avgImprovement >= 0 ? `+${avgImprovement}` : avgImprovement}</Text>
                <Text style={styles.profileStatLabel}>Avg Improvement</Text>
              </View>
            </View>

            {/* Settings list cards */}
            <Text style={styles.sectionHeaderTitle}>Profile Settings</Text>
            <View style={styles.settingsListCardContainer}>
              <TouchableOpacity style={styles.settingItemRow} onPress={() => Alert.alert('Edit Profile', 'Edit profile clicked.')}>
                <Text style={styles.settingItemLabel}>Edit profile</Text>
                <Text style={styles.settingItemChevron}>➔</Text>
              </TouchableOpacity>
              <View style={styles.settingDivider} />
              <TouchableOpacity style={styles.settingItemRow} onPress={() => setOnboardStep('type')}>
                <Text style={styles.settingItemLabel}>Skin type & goals</Text>
                <Text style={styles.settingItemChevron}>➔</Text>
              </TouchableOpacity>
              <View style={styles.settingDivider} />
              <TouchableOpacity style={styles.settingItemRow} onPress={() => Alert.alert('Notifications', 'Preferences saved.')}>
                <Text style={styles.settingItemLabel}>Notification preferences</Text>
                <Text style={styles.settingItemChevron}>➔</Text>
              </TouchableOpacity>
              <View style={styles.settingDivider} />
              <TouchableOpacity style={styles.settingItemRow} onPress={() => Alert.alert('Privacy', 'Your data is secured.')}>
                <Text style={styles.settingItemLabel}>Privacy & data</Text>
                <Text style={styles.settingItemChevron}>➔</Text>
              </TouchableOpacity>
              <View style={styles.settingDivider} />
              <TouchableOpacity 
                style={styles.settingItemRow} 
                onPress={() => {
                  Alert.alert(
                    'Confirm Deletion',
                    'Permanently delete all skin metrics, profile data, and scans? This cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Delete My Data', 
                        style: 'destructive',
                        onPress: async () => {
                          await clearUserHistory();
                          Alert.alert('Data Purged', 'All skin metrics and files deleted.');
                        } 
                      }
                    ]
                  );
                }}
              >
                <Text style={[styles.settingItemLabel, { color: '#E53E3E' }]}>Delete my data</Text>
                <Text style={[styles.settingItemChevron, { color: '#E53E3E' }]}>➔</Text>
              </TouchableOpacity>
              <View style={styles.settingDivider} />
              <TouchableOpacity style={styles.settingItemRow} onPress={() => Alert.alert('About', 'DermaAI version 1.0.0. Made for Indian skin types.')}>
                <Text style={styles.settingItemLabel}>About DermaAI</Text>
                <Text style={styles.settingItemChevron}>➔</Text>
              </TouchableOpacity>
              <View style={styles.settingDivider} />
              <TouchableOpacity style={styles.settingItemRow} onPress={async () => {
                await clearUserHistory();
                Alert.alert('Logged Out', 'Session cleared.');
              }}>
                <Text style={styles.settingItemLabel}>Log out</Text>
                <Text style={styles.settingItemChevron}>➔</Text>
              </TouchableOpacity>
            </View>

            {/* Developer Connections widget */}
            <Text style={[styles.sectionHeaderTitle, { marginTop: 24 }]}>Developer Connections</Text>
            <BlurView intensity={75} tint="light" style={styles.devCard}>
              <Text style={styles.devLabel}>Local Server API Endpoint IP Address</Text>
              <TextInput
                style={styles.devInput}
                value={backendUrl}
                onChangeText={setBackendUrl}
                placeholder="http://192.168.1.X:3000"
              />
              <TouchableOpacity
                style={[styles.devSyncButton, { backgroundColor: COLORS.rosePrimary }]}
                onPress={async () => {
                  try {
                    const res = await fetch('https://raw.githubusercontent.com/Keshav981/skiniq-app/main/backend_url.txt?t=' + Date.now());
                    if (res.ok) {
                      const urlText = (await res.text()).trim();
                      if (urlText.startsWith('https://')) {
                        await setBackendUrl(urlText);
                        Alert.alert('Synced!', `Backend URL updated to: ${urlText}`);
                      } else {
                        Alert.alert('Sync Failed', 'Fetched URL is invalid.');
                      }
                    } else {
                      Alert.alert('Sync Failed', 'Failed to fetch from GitHub.');
                    }
                  } catch (err) {
                    Alert.alert('Sync Error', 'Check your internet connection.');
                  }
                }}
              >
                <Text style={styles.devSyncButtonText}>Sync Active Tunnel from GitHub</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        )}
      </ScrollView>

      {/* Screen 11: Subscription Paywall Modal */}
      {paywallVisible && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 999997 }]}>
        <LinearGradient
          colors={[COLORS.bgLight, '#FFF']}
          style={styles.paywallWrapper}
        >
          <View style={styles.paywallHeader}>
            <TouchableOpacity style={styles.paywallCloseBtn} onPress={() => setPaywallVisible(false)}>
              <Text style={styles.paywallCloseIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.paywallScroll}>
            <Text style={{ fontSize: 44 }}>🔒</Text>
            <Text style={styles.paywallTitle}>Unlock your skin journey</Text>
            <Text style={styles.paywallSubtitle}>Your first scan is free. Subscribe to track your progress.</Text>

            {/* Pricing Cards */}
            <View style={styles.paywallPriceCardsRow}>
              <TouchableOpacity 
                style={[styles.paywallPriceCard, { borderColor: COLORS.border }]} 
                onPress={() => buySubscription('monthly')}
              >
                <Text style={styles.paywallPriceTier}>Monthly</Text>
                <Text style={styles.paywallPriceVal}>₹149/month</Text>
                <Text style={styles.paywallPriceDesc}>Cancel anytime</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.paywallPriceCard, styles.paywallPriceCardSelected]} 
                onPress={() => buySubscription('annual')}
              >
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueText}>BEST VALUE</Text>
                </View>
                <Text style={[styles.paywallPriceTier, { color: COLORS.rosePrimary }]}>Annual</Text>
                <Text style={[styles.paywallPriceVal, { color: COLORS.rosePrimary }]}>₹999/year</Text>
                <Text style={styles.paywallPriceDesc}>Save 44% compared to monthly</Text>
              </TouchableOpacity>
            </View>

            {/* Feature checklist */}
            <View style={[styles.perkList, { marginTop: 24 }]}>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Unlimited Scans</Text>
                  <Text style={styles.perkDesc}>Scan daily and track micro skin improvements.</Text>
                </View>
              </View>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Full Trend History</Text>
                  <Text style={styles.perkDesc}>Review overall skin improvement graphs over time.</Text>
                </View>
              </View>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Personalised Recommendations</Text>
                  <Text style={styles.perkDesc}>Custom matching actives from catalog products.</Text>
                </View>
              </View>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Home Remedy Library</Text>
                  <Text style={styles.perkDesc}>Unlock natural, free skin fixes you can make at home.</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.primaryButton, { backgroundColor: COLORS.rosePrimary, width: '100%' }]}
              onPress={async () => {
                await buySubscription('annual');
                setPaywallVisible(false);
                Alert.alert('Subscription Activated', 'Welcome to DermaAI Pro!');
              }}
            >
              <Text style={styles.primaryButtonText}>Start free — subscribe now</Text>
            </TouchableOpacity>

            <Text style={styles.paywallTerms}>
              Cancel anytime · Secure payment · No hidden charges
            </Text>
          </ScrollView>
        </LinearGradient>
        </View>
      )}

      {/* Bottom Navigation Tabs Bar */}
      <BlurView
        intensity={85}
        tint="light"
        style={[styles.bottomTabContainer, { paddingBottom: insets.bottom || 16 }]}
      >
        <View style={styles.bottomTabRow}>
          {/* Animated sliding indicator */}
          <Animated.View
            style={[
              styles.activeTabIndicator,
              {
                transform: [{ translateX }]
              }
            ]}
          >
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFillObject} />
          </Animated.View>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'camera' && styles.tabButtonActive]}
            onPress={() => setActiveTab('camera')}
          >
            <Text style={styles.tabBtnIcon}>📸</Text>
            <Text style={[styles.tabBtnText, activeTab === 'camera' && styles.tabBtnTextActive]}>Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'insights' && styles.tabButtonActive]}
            onPress={() => setActiveTab('insights')}
          >
            <Text style={styles.tabBtnIcon}>📊</Text>
            <Text style={[styles.tabBtnText, activeTab === 'insights' && styles.tabBtnTextActive]}>Insights</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'products' && styles.tabButtonActive]}
            onPress={() => setActiveTab('products')}
          >
            <Text style={styles.tabBtnIcon}>🧴</Text>
            <Text style={[styles.tabBtnText, activeTab === 'products' && styles.tabBtnTextActive]}>Recommend</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'journey' && styles.tabButtonActive]}
            onPress={() => setActiveTab('journey')}
          >
            <Text style={styles.tabBtnIcon}>📈</Text>
            <Text style={[styles.tabBtnText, activeTab === 'journey' && styles.tabBtnTextActive]}>History</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
            onPress={() => setActiveTab('profile')}
          >
            <Text style={styles.tabBtnIcon}>👤</Text>
            <Text style={[styles.tabBtnText, activeTab === 'profile' && styles.tabBtnTextActive]}>Account</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
      {renderDesignPreviewPanel()}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  mockDataBanner: {
    backgroundColor: '#FDF0F3',
    borderWidth: 1,
    borderColor: 'rgba(212, 83, 126, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(212, 83, 126, 0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1
  },
  mockDataBannerText: {
    color: '#D4537E',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center'
  },
  onboardContainer: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  onboardScroll: {
    padding: 24,
    paddingBottom: 60
  },
  splashContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    width: '100%'
  },
  logoBadgeContainer: {
    alignItems: 'center',
    marginBottom: 20
  },
  logoBadgeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2
  },
  splashLogoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#D4537E',
    marginTop: 12,
    letterSpacing: 0.5
  },
  splashTagline: {
    fontSize: 16,
    color: '#888780',
    fontStyle: 'italic',
    marginBottom: 40,
    textAlign: 'center'
  },
  splashInputWrapper: {
    width: '100%',
    marginBottom: 24
  },
  splashInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888780',
    marginBottom: 8
  },
  splashTextInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#2C2C2A'
  },
  splashCTA: {
    width: '100%',
    height: 50,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D4537E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3
  },
  splashCTAText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  },
  splashLink: {
    marginTop: 20
  },
  splashLinkText: {
    color: '#D4537E',
    fontSize: 14,
    fontWeight: '500'
  },
  progressBarContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#D4537E',
    borderRadius: 3
  },
  progressBarText: {
    fontSize: 12,
    color: '#888780',
    marginLeft: 12,
    fontWeight: '500'
  },
  onboardHeading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C2C2A',
    marginBottom: 6
  },
  onboardSubheading: {
    fontSize: 15,
    color: '#888780',
    marginBottom: 24
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  typeCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  typeCardSelected: {
    borderColor: '#D4537E',
    borderWidth: 1.5
  },
  typeCardIcon: {
    fontSize: 24,
    marginBottom: 8
  },
  typeCardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C2C2A',
    marginBottom: 4
  },
  typeCardDesc: {
    fontSize: 11,
    color: '#888780',
    lineHeight: 14
  },
  typeCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D4537E',
    justifyContent: 'center',
    alignItems: 'center'
  },
  typeCheckText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold'
  },
  goalsPillWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 20
  },
  goalPill: {
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    margin: 4,
    backgroundColor: '#FFF'
  },
  goalPillSelected: {
    backgroundColor: '#D4537E',
    borderColor: '#D4537E'
  },
  goalPillText: {
    fontSize: 13,
    color: '#888780',
    fontWeight: '500'
  },
  goalPillTextSelected: {
    color: '#FFF',
    fontWeight: '600'
  },
  ageListContainer: {
    width: '100%',
    marginBottom: 20
  },
  ageRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12
  },
  ageRowCardSelected: {
    borderColor: '#D4537E'
  },
  ageRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C2C2A'
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E8E6E0',
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioCircleChecked: {
    borderColor: '#D4537E'
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D4537E'
  },
  darkCameraViewfinder: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.72,
    backgroundColor: '#000',
    overflow: 'hidden'
  },
  viewfinderDarkBackground: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0A0A09',
    justifyContent: 'center',
    alignItems: 'center'
  },
  ovalGuideViewfinder: {
    width: SCREEN_WIDTH * 0.65,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: '#D4537E',
    borderStyle: 'solid',
    shadowColor: '#D4537E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10
  },
  viewfinderTopControls: {
    position: 'absolute',
    top: 24,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10
  },
  viewfinderControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  viewfinderControlIcon: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  },
  floatingTipPill: {
    position: 'absolute',
    top: 80,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
    zIndex: 10
  },
  floatingTipText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '500'
  },
  viewfinderBottomRow: {
    position: 'absolute',
    bottom: 70,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10
  },
  lastScanThumbBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FFF'
  },
  lastScanThumbImg: {
    width: '100%',
    height: '100%'
  },
  circularCaptureBtnOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  circularCaptureBtnInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#D4537E'
  },
  lastScanThumbBtnPlaceholder: {
    width: 48
  },
  uploadInsteadBtn: {
    position: 'absolute',
    bottom: 30,
    zIndex: 10
  },
  uploadInsteadText: {
    color: '#FFF',
    fontSize: 13,
    textDecorationLine: 'underline'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FAFAF8'
  },
  loadingInnerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    width: '100%'
  },
  loadingRingWrapper: {
    width: 140,
    height: 140,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30
  },
  loadingRingOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    position: 'absolute'
  },
  loadingRingGradient: {
    flex: 1,
    borderRadius: 70
  },
  loadingRingSilhouette: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFF',
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingMainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C2C2A',
    marginBottom: 20
  },
  statusLinesList: {
    width: '100%',
    paddingHorizontal: 40,
    marginBottom: 40
  },
  statusLineItem: {
    fontSize: 14,
    color: '#888780',
    marginVertical: 6,
    fontWeight: '500'
  },
  loadingDisclaimer: {
    fontSize: 12,
    color: '#888780',
    textAlign: 'center',
    paddingHorizontal: 20,
    position: 'absolute',
    bottom: 40
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 83, 126, 0.15)'
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF5F7',
    borderWidth: 1.5,
    borderColor: '#D4537E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D4537E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  headerLogo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#D4537E',
    letterSpacing: 0.5
  },
  headerWelcome: {
    fontSize: 13,
    color: '#888780',
    marginTop: 2
  },
  subscriptionBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12
  },
  badgeActive: {
    backgroundColor: 'rgba(212, 83, 126, 0.1)',
    borderWidth: 1,
    borderColor: '#D4537E'
  },
  badgeFree: {
    backgroundColor: '#E8E6E0',
    borderWidth: 1,
    borderColor: '#E8E6E0'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2C2C2A'
  },
  scrollContent: {
    paddingBottom: 110
  },
  tabContentContainer: {
    padding: 24
  },
  cameraBoxContainer: {
    height: SCREEN_HEIGHT * 0.65,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden'
  },
  overlayGuideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  overlayGuideCutout: {
    width: SCREEN_WIDTH * 0.62,
    height: SCREEN_WIDTH * 0.85,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: '#D4537E',
    backgroundColor: 'transparent'
  },
  cameraOverlayTip: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D4537E'
  },
  tabTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2C2C2A',
    marginBottom: 6
  },
  tabSubtitle: {
    fontSize: 14,
    color: '#888780',
    lineHeight: 22,
    marginBottom: 24
  },
  insightsGaugeCard: {
    alignItems: 'center',
    marginVertical: 20
  },
  gaugeOuterRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    padding: 4,
    backgroundColor: '#E8E6E0',
    justifyContent: 'center',
    alignItems: 'center'
  },
  gaugeInnerRing: {
    flex: 1,
    borderRadius: 76,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center'
  },
  gaugeCenterWhite: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  gaugeScoreBig: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  gaugeScoreLabelText: {
    fontSize: 12,
    color: '#888780',
    fontWeight: '500',
    marginTop: 4
  },
  deltaBadgePill: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#EAF5EC'
  },
  deltaBadgeText: {
    fontSize: 12,
    color: '#639922',
    fontWeight: 'bold'
  },
  prosConsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  prosConsColumn: {
    flex: 1,
    paddingHorizontal: 4
  },
  prosConsHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8
  },
  prosConsBullet: {
    fontSize: 12,
    color: '#888780',
    marginVertical: 3
  },
  prosConsDivider: {
    width: 1,
    backgroundColor: '#E8E6E0',
    marginHorizontal: 8
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C2C2A',
    marginTop: 10,
    marginBottom: 14
  },
  dimensionCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  dimHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dimTitleCol: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dimIcon: {
    fontSize: 20,
    marginRight: 8
  },
  dimName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C2C2A'
  },
  dimScoreColRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dimScoreBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12
  },
  dimScoreText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF'
  },
  chevronIcon: {
    fontSize: 10,
    color: '#888780',
    marginLeft: 8
  },
  dimSubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  metricProgressBg: {
    height: 6,
    width: '100%',
    backgroundColor: '#E8E6E0',
    borderRadius: 3,
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden'
  },
  metricProgressFill: {
    height: '100%',
    borderRadius: 3
  },
  tapToExpandText: {
    fontSize: 10,
    color: '#888780',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic'
  },
  expandedContentBlock: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E6E0',
    paddingTop: 10
  },
  dimExplanation: {
    fontSize: 13,
    color: '#888780',
    lineHeight: 18
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E8E6E0',
    marginVertical: 10
  },
  ingredientsRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start'
  },
  ingredientsTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2C2C2A',
    width: 90
  },
  ingredientsValue: {
    fontSize: 11,
    color: '#888780',
    flex: 1
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start'
  },
  actionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2C2C2A',
    width: 90
  },
  actionValue: {
    fontSize: 11,
    color: '#888780',
    flex: 1,
    lineHeight: 15
  },
  cardActionLink: {
    alignSelf: 'flex-end',
    paddingVertical: 4
  },
  cardActionLinkText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  emptyStateCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center'
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C2C2A',
    marginBottom: 8
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888780',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#D4537E',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D4537E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF'
  },
  horizontalProductsScroll: {
    paddingBottom: 8
  },
  recomProductCard: {
    width: 160,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 12,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  recomProductBadgeContainer: {
    flexDirection: 'row',
    marginBottom: 8
  },
  recomProductBadge: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: '600',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999
  },
  recomProductImage: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#E8E6E0'
  },
  recomProductBrand: {
    fontSize: 10,
    color: '#888780',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  recomProductName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2C2C2A',
    marginTop: 2
  },
  recomProductPrice: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D4537E',
    marginTop: 2,
    marginBottom: 8
  },
  recomCTAButton: {
    width: '100%',
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center'
  },
  recomCTAText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold'
  },
  recomDisclosure: {
    fontSize: 9,
    color: '#888780',
    textAlign: 'center',
    marginTop: 4
  },
  remediesList: {
    width: '100%'
  },
  remedyRowCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  remedyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  remedyNameText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2C2C2A',
    flex: 1
  },
  remedyTagPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#FFF5F7',
    borderWidth: 1,
    borderColor: '#E8E6E0'
  },
  remedyTagText: {
    fontSize: 9,
    color: '#D4537E',
    fontWeight: '600'
  },
  remedyInstruction: {
    fontSize: 12,
    color: '#888780',
    lineHeight: 18,
    marginBottom: 8
  },
  naturalBadge: {
    flexDirection: 'row'
  },
  naturalBadgeText: {
    fontSize: 10,
    color: '#639922',
    fontWeight: 'bold',
    backgroundColor: '#EAF5EC',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999
  },
  chartContainer: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E8E6E0',
    marginBottom: 24,
    alignItems: 'center'
  },
  emptyChartContainer: {
    height: 120,
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E6E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24
  },
  emptyChartText: {
    fontSize: 12,
    color: '#888780'
  },
  gridLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: '#E8E6E0'
  },
  chartDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D4537E',
    borderWidth: 2,
    borderColor: '#FFF',
    zIndex: 10
  },
  chartValueLabel: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D4537E',
    width: 24,
    textAlign: 'center'
  },
  chartDateLabel: {
    position: 'absolute',
    fontSize: 10,
    color: '#888780',
    width: 30,
    textAlign: 'center'
  },
  chartLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#D4537E',
    zIndex: 5
  },
  timelineList: {
    width: '100%'
  },
  timelineRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  timelineThumbFrame: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden'
  },
  timelineThumbImage: {
    width: '100%',
    height: '100%'
  },
  timelineInfoCol: {
    flex: 1,
    marginLeft: 12
  },
  timelineDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C2C2A'
  },
  timelineLabelText: {
    fontSize: 11,
    color: '#888780',
    marginTop: 2
  },
  timelineBadgeCol: {
    alignItems: 'flex-end',
    marginRight: 12
  },
  timelineScoreBadge: {
    backgroundColor: '#FFF5F7',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6
  },
  timelineScoreText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  timelineDeltaBadge: {
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999
  },
  timelineDeltaText: {
    fontSize: 9,
    fontWeight: 'bold'
  },
  timelineChevron: {
    fontSize: 12,
    color: '#888780'
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E6E0'
  },
  detailHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C2C2A'
  },
  detailTopCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20
  },
  detailImageRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  detailThumbFrame: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden'
  },
  detailThumbImage: {
    width: '100%',
    height: '100%'
  },
  detailDateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C2C2A'
  },
  detailTimeText: {
    fontSize: 12,
    color: '#888780',
    marginTop: 2
  },
  detailScoreBadge: {
    alignItems: 'center',
    backgroundColor: '#FFF5F7',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  detailScoreNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  detailScoreLabel: {
    fontSize: 9,
    color: '#888780'
  },
  profileAvatarCard: {
    alignItems: 'center',
    marginVertical: 20
  },
  profileAvatarBig: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF5F7',
    borderWidth: 2,
    borderColor: '#D4537E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D4537E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6
  },
  profileAvatarTextBig: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  profileNameBig: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C2C2A',
    marginTop: 12
  },
  profileProBadge: {
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999
  },
  profileProText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: 'bold'
  },
  profileStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1
  },
  profileStatBox: {
    flex: 1,
    alignItems: 'center'
  },
  profileStatNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4537E'
  },
  profileStatLabel: {
    fontSize: 10,
    color: '#888780',
    marginTop: 4
  },
  profileStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E8E6E0'
  },
  settingsListCardContainer: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E6E0',
    borderRadius: 16,
    overflow: 'hidden'
  },
  settingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16
  },
  settingItemLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C2C2A'
  },
  settingItemChevron: {
    fontSize: 12,
    color: '#888780'
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#E8E6E0'
  },
  paywallWrapper: {
    flex: 1
  },
  paywallHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'flex-end'
  },
  paywallCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  paywallCloseIcon: {
    fontSize: 14,
    color: '#2C2C2A',
    fontWeight: '600'
  },
  paywallScroll: {
    padding: 24,
    paddingBottom: 60,
    alignItems: 'center'
  },
  paywallTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#D4537E',
    marginTop: 12,
    textAlign: 'center'
  },
  paywallSubtitle: {
    fontSize: 14,
    color: '#888780',
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center'
  },
  paywallPriceCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20
  },
  paywallPriceCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    position: 'relative'
  },
  paywallPriceCardSelected: {
    borderColor: '#D4537E',
    borderWidth: 1.5,
    backgroundColor: '#FFF5F7'
  },
  paywallPriceTier: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2C2C2A'
  },
  paywallPriceVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C2C2A',
    marginTop: 4
  },
  paywallPriceDesc: {
    fontSize: 11,
    color: '#888780',
    marginTop: 4
  },
  perkList: {
    width: '100%',
    marginBottom: 24
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  perkIcon: {
    fontSize: 18,
    color: '#639922',
    fontWeight: 'bold',
    marginRight: 14
  },
  perkTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C2C2A'
  },
  perkDesc: {
    fontSize: 12,
    color: '#888780',
    marginTop: 2
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#BA7517',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  bestValueText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#FFF'
  },
  paywallTerms: {
    fontSize: 10,
    color: '#888780',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 14
  },
  bottomTabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 83, 126, 0.22)',
    overflow: 'hidden'
  },
  bottomTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    position: 'relative'
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    zIndex: 10
  },
  tabBtnIcon: {
    fontSize: 20
  },
  tabBtnText: {
    fontSize: 10,
    color: '#888780',
    fontWeight: '500',
    marginTop: 4
  },
  tabBtnTextActive: {
  },
  authTabActiveText: {
    color: COLORS.roseDark
  },
  floatingPreviewToggle: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    zIndex: 99999,
    backgroundColor: COLORS.rosePrimary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6
  },
  floatingPreviewToggleText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 6,
    fontSize: 12
  },
  previewPanelModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end'
  },
  previewPanelModalContent: {
    backgroundColor: COLORS.bgLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: '75%'
  },
  previewPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder
  },
  previewPanelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark
  },
  previewPanelCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.greyLight,
    justifyContent: 'center',
    alignItems: 'center'
  },
  previewPanelScroll: {
    paddingVertical: 12
  },
  previewScreenBtn: {
    backgroundColor: COLORS.bgCard,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  previewScreenBtnActive: {
    backgroundColor: COLORS.rosePrimary,
    borderColor: COLORS.rosePrimary
  },
  previewScreenBtnText: {
    fontSize: 14,
    color: COLORS.textDark
  },
  previewSeparator: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginVertical: 8
  }
});
