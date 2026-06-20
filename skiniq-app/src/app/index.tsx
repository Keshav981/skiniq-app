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
  Animated
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { useApp, Scan, Product, ScanScores, ScanExplanations } from '../context/AppContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper to convert URI (like blob or local file) to base64
const getBase64FromUri = async (uri: string): Promise<string> => {
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
  bgLight: '#FFFBF9',
  bgCard: '#FFFFFF',
  rosePrimary: '#F2A0A1',
  roseDark: '#D87A7D',
  roseLight: '#FCECEC',
  roseMuted: '#E8C5C8',
  textDark: '#3C2F30',
  textMuted: '#8E7C7D',
  goldAccent: '#D4AF37',
  greenSuccess: '#6E9E80',
  glassBorder: '#F5E4E4',
  shadowColor: 'rgba(216, 122, 125, 0.12)',
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
    profile,
    scans,
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
    lastScanImageBase64
  } = useApp();

  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'camera' | 'insights' | 'journey' | 'products' | 'profile'>('camera');
  
  // Onboarding & Login states
  const [onboardMode, setOnboardMode] = useState<'login' | 'register'>('login');
  const [loginNameInput, setLoginNameInput] = useState('');
  const [onboardName, setOnboardName] = useState('');
  const [onboardAge, setOnboardAge] = useState('25-34');
  const [onboardSkinType, setOnboardSkinType] = useState<string | null>('combination');
  const [onboardGoals, setOnboardGoals] = useState<string[]>(['hydration', 'general_health']);

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
  const [savePhotosConsent, setSavePhotosConsent] = useState(true);
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
        if (!base64Data && photo.uri) {
          base64Data = await getBase64FromUri(photo.uri);
        }
        if (base64Data) {
          setUseCameraActive(false);
          setAnalyzingPhotoUri(base64Data.startsWith('data:image/') ? base64Data : `data:image/jpeg;base64,${base64Data}`);
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
        if (!base64Img && pickerResult.assets[0].uri) {
          setAnalysisProgressMsg('Reading photo file...');
          setIsAnalyzing(true);
          base64Img = await getBase64FromUri(pickerResult.assets[0].uri);
        }
        if (base64Img) {
          setAnalyzingPhotoIsFront(false);
          setAnalyzingPhotoUri(base64Img.startsWith('data:image/') ? base64Img : `data:image/jpeg;base64,${base64Img}`);
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
      if (err.message.includes('Subscription required') || err.message.includes('403')) {
        setPaywallVisible(true);
      } else {
        Alert.alert('Analysis Failed', err.message || 'Server did not return a valid response. Please retry.');
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

  // 1. Onboarding UI (If no profile yet)
  if (!profile) {
    const goalsList = [
      { id: 'hydration', label: 'Hydration & Dewiness', icon: '💧' },
      { id: 'anti-aging', label: 'Anti-Aging & Fine Lines', icon: '🌸' },
      { id: 'brightening', label: 'Brightening & Even Tone', icon: '🎭' },
      { id: 'pores', label: 'Pore Clarifying', icon: '🔍' },
      { id: 'general_health', label: 'General Skin Barrier Health', icon: '🛡️' }
    ];

    const toggleGoal = (goalId: string) => {
      if (onboardGoals.includes(goalId)) {
        setOnboardGoals(onboardGoals.filter(g => g !== goalId));
      } else {
        setOnboardGoals([...onboardGoals, goalId]);
      }
    };

    return (
      <SafeAreaView style={styles.onboardContainer}>
        <ScrollView contentContainerStyle={styles.onboardScroll}>
          <View style={styles.onboardHeaderContainer}>
            <Text style={styles.logoText}>Derma AI</Text>
            <Text style={styles.subtitleText}>Your AI Beauty-Tech Companion</Text>
          </View>

          <BlurView intensity={75} tint="light" style={styles.onboardCard}>
            {/* Elegant glassmorphic authentication tabs */}
            <View style={styles.authTabsRow}>
              <TouchableOpacity
                style={[styles.authTab, onboardMode === 'login' && styles.authTabActive]}
                onPress={() => setOnboardMode('login')}
              >
                <Text style={[styles.authTabText, onboardMode === 'login' && styles.authTabActiveText]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authTab, onboardMode === 'register' && styles.authTabActive]}
                onPress={() => setOnboardMode('register')}
              >
                <Text style={[styles.authTabText, onboardMode === 'register' && styles.authTabActiveText]}>New Profile</Text>
              </TouchableOpacity>
            </View>

            {onboardMode === 'login' ? (
              <View>
                <Text style={styles.sectionHeader}>Welcome Back</Text>
                
                <Text style={styles.inputLabel}>Registered Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={loginNameInput}
                  onChangeText={setLoginNameInput}
                  placeholder="Enter your name to sign in"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="words"
                />

                <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
                  <Text style={styles.primaryButtonText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.sectionHeader}>Tell us about yourself</Text>
                
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={onboardName}
                  onChangeText={setOnboardName}
                  placeholder="Enter your name"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="words"
                />
      
                <Text style={styles.inputLabel}>Age Group</Text>
                <View style={styles.chipRow}>
                  {['18-24', '25-34', '35-44', '45+'].map(age => (
                    <TouchableOpacity
                      key={age}
                      style={[styles.chip, onboardAge === age && styles.chipActive]}
                      onPress={() => setOnboardAge(age)}
                    >
                      <Text style={[styles.chipText, onboardAge === age && styles.chipTextActive]}>{age}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
      
                <Text style={styles.inputLabel}>Skin Type Self-Assessment (Optional)</Text>
                <View style={styles.chipRow}>
                  {[
                    { id: 'dry', label: 'Dry' },
                    { id: 'oily', label: 'Oily' },
                    { id: 'combination', label: 'Combination' },
                    { id: 'sensitive', label: 'Sensitive' }
                  ].map(type => (
                    <TouchableOpacity
                      key={type.id}
                      style={[styles.chip, onboardSkinType === type.id && styles.chipActive]}
                      onPress={() => setOnboardSkinType(type.id)}
                    >
                      <Text style={[styles.chipText, onboardSkinType === type.id && styles.chipTextActive]}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
      
                <Text style={styles.inputLabel}>Skin Goals (Select Multiples)</Text>
                {goalsList.map(goal => {
                  const selected = onboardGoals.includes(goal.id);
                  return (
                    <TouchableOpacity
                      key={goal.id}
                      style={[styles.goalSelectCard, selected && styles.goalSelectCardActive]}
                      onPress={() => toggleGoal(goal.id)}
                    >
                      <Text style={goal.id === 'hydration' ? styles.goalSelectIcon : { fontSize: 20, marginRight: 12 }}>{goal.icon}</Text>
                      <Text style={[styles.goalSelectLabel, selected && styles.goalSelectLabelActive]}>{goal.label}</Text>
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]} />
                    </TouchableOpacity>
                  );
                })}
      
                <TouchableOpacity style={styles.primaryButton} onPress={handleStartOnboarding}>
                  <Text style={styles.primaryButtonText}>Continue to Skin Check</Text>
                </TouchableOpacity>
              </View>
            )}
          </BlurView>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Loading / Analyzing overlay
  if (isAnalyzing) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>Analyzing Your Skin...</Text>
        <Text style={styles.loadingSubtitle}>{statusMessages[activeStatusIndex]}</Text>
        
        <View style={styles.scannerWrapper}>
          {analyzingPhotoUri ? (
            <Image 
              source={{ uri: analyzingPhotoUri }} 
              style={[styles.scannerImage, analyzingPhotoIsFront && { transform: [{ scaleX: -1 }] }]} 
              resizeMode="cover" 
            />
          ) : (
            <View style={styles.scannerImagePlaceholder}>
              <ActivityIndicator size="large" color={COLORS.rosePrimary} />
              <Text style={{ color: COLORS.textMuted, marginTop: 12 }}>Initializing Scanner...</Text>
            </View>
          )}
          
          {/* Laser Line */}
          <Animated.View 
            style={[
              styles.laserLine, 
              {
                top: scanAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '98%']
                })
              }
            ]} 
          />
          
          {/* Pulsing Scanning dots */}
          {analyzingPhotoUri && (
            <>
              {/* Forehead */}
              <Animated.View style={[styles.pulseDot, { left: '50%', top: '22%', opacity: pulseAnim }]} />
              {/* Nose */}
              <Animated.View style={[styles.pulseDot, { left: '50%', top: '50%', opacity: pulseAnim }]} />
              {/* Left Cheek */}
              <Animated.View style={[styles.pulseDot, { left: analyzingPhotoIsFront ? '70%' : '30%', top: '60%', opacity: pulseAnim }]} />
              {/* Right Cheek */}
              <Animated.View style={[styles.pulseDot, { left: analyzingPhotoIsFront ? '30%' : '70%', top: '58%', opacity: pulseAnim }]} />
            </>
          )}
        </View>
        
        <ActivityIndicator size="small" color={COLORS.roseDark} style={{ marginTop: 24 }} />
        <Text style={styles.disclaimerTextSmall}>
          This assessment represents cosmetic evaluation and does not constitute medical advice.
        </Text>
      </View>
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
      colors={['#FFF5F5', '#FFEAEA', '#F3E5F5', '#FFFBF9']}
      style={styles.container}
    >
      {/* Dynamic Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.headerLogo}>Derma AI</Text>
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
            <Text style={styles.badgeText}>
              {subscription.status === 'active' ? 'PRO MEMBER' : 'FREE ACCOUNT'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Main Tab Screen Switcher */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* CAMERA TAB */}
        {activeTab === 'camera' && (
          <View style={styles.tabContentContainer}>
            {useCameraActive ? (
              <View style={styles.cameraBoxContainer}>
                {cameraPermission && cameraPermission.granted ? (
                  <View style={styles.cameraFrame}>
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
                  <View style={styles.permissionErrorCard}>
                    <Text style={styles.paragraphCenter}>Camera permissions are required to operate scan diagnostics.</Text>
                    <TouchableOpacity style={styles.outlineButton} onPress={handleCameraPermissionRequest}>
                      <Text style={styles.outlineButtonText}>Grant Camera Access</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.unifiedPageLayout}>
                {/* 2026 Sleek Dermal Forecast Widget - Replaces lady image */}
                <BlurView intensity={65} tint="light" style={styles.forecastWidget}>
                  <View style={styles.forecastHeader}>
                    <Text style={styles.forecastGreeting}>{getGreeting()}</Text>
                    <Text style={styles.forecastTitle}>Today's Dermal Forecast</Text>
                    <View style={styles.envSwitcher}>
                      {(['outdoor', 'office', 'dry'] as const).map((env) => (
                        <TouchableOpacity
                          key={env}
                          style={[
                            styles.envSwitchBtn,
                            envContext === env && styles.envSwitchBtnActive
                          ]}
                          onPress={() => setEnvContext(env)}
                        >
                          <Text
                            style={[
                              styles.envSwitchText,
                              envContext === env && styles.envSwitchTextActive
                            ]}
                          >
                            {env === 'outdoor' ? '☀️ Out' : env === 'office' ? '🏢 In' : '🌵 Dry'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.forecastStatsRow}>
                    <View style={styles.forecastStatItem}>
                      <Text style={styles.forecastStatLabel}>UV INDEX</Text>
                      <Text style={[styles.forecastStatValue, { color: envData[envContext].uvColor }]}>
                        {envData[envContext].uv}
                      </Text>
                    </View>
                    <View style={styles.forecastStatDivider} />
                    <View style={styles.forecastStatItem}>
                      <Text style={styles.forecastStatLabel}>HUMIDITY</Text>
                      <Text style={styles.forecastStatValue}>{envData[envContext].humidity}</Text>
                    </View>
                    <View style={styles.forecastStatDivider} />
                    <View style={styles.forecastStatItem}>
                      <Text style={styles.forecastStatLabel}>AIR QUALITY</Text>
                      <Text style={styles.forecastStatValue}>{envData[envContext].aqi}</Text>
                    </View>
                  </View>

                  <View style={styles.forecastAlertBox}>
                    <View style={styles.forecastAlertBadge}>
                      <Text style={styles.forecastAlertBadgeText}>
                        🛡️ {envData[envContext].barrierStatus}
                      </Text>
                    </View>
                    <Text style={styles.forecastAlertTip}>{envData[envContext].tip}</Text>
                  </View>
                </BlurView>

                {/* Dermal Diagnostics Unified Scan Deck */}
                <BlurView intensity={70} tint="light" style={styles.unifiedScanDeck}>
                  <Text style={styles.deckTitle}>Dermal Scanner Control Deck</Text>
                  <Text style={styles.deckSubtitle}>
                    Position yourself in natural light and capture or upload a high-resolution selfie to trigger the AI visual analysis.
                  </Text>

                  {/* Vertical camera & gallery launch actions */}
                  <View style={styles.deckActionsList}>
                    <TouchableOpacity
                      style={styles.deckActionRowBtn}
                      onPress={() => setUseCameraActive(true)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.deckActionRowIcon}>📸</Text>
                        <View style={{ marginLeft: 12 }}>
                          <Text style={styles.deckActionRowTitle}>Open Dermal Camera</Text>
                          <Text style={styles.deckActionRowDesc}>Take a live photo for active scanning</Text>
                        </View>
                      </View>
                      <Text style={styles.deckActionRowChevron}>➔</Text>
                    </TouchableOpacity>

                    <View style={styles.deckActionDivider} />

                    <TouchableOpacity
                      style={styles.deckActionRowBtn}
                      onPress={selectPhotoFromGallery}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.deckActionRowIcon}>🖼️</Text>
                        <View style={{ marginLeft: 12 }}>
                          <Text style={styles.deckActionRowTitle}>Import Skin Photo</Text>
                          <Text style={styles.deckActionRowDesc}>Select a photo from your gallery</Text>
                        </View>
                      </View>
                      <Text style={styles.deckActionRowChevron}>➔</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.deckDivider} />

                  {/* Inline Consent Control */}
                  <View style={styles.deckConsentRow}>
                    <View style={{ flex: 1, marginRight: 16 }}>
                      <Text style={styles.deckConsentTitle}>In-Memory Processing Consent</Text>
                      <Text style={styles.deckConsentDesc}>
                        Photos are processed in-memory and immediately discarded. We never save raw photos on our servers.
                      </Text>
                    </View>
                    <Switch
                      value={!savePhotosConsent}
                      onValueChange={(val) => setSavePhotosConsent(!val)}
                      trackColor={{ false: COLORS.greyLight, true: COLORS.roseLight }}
                      thumbColor={!savePhotosConsent ? COLORS.rosePrimary : '#FFF'}
                    />
                  </View>

                  <View style={styles.deckDivider} />

                  {/* Tips & Recommendations inside the deck */}
                  <View style={styles.deckTipsSection}>
                    <Text style={styles.deckTipsTitle}>💡 Tips for Optimal Diagnostics:</Text>
                    <Text style={styles.deckTipsItem}>• Stand facing a window for bright, natural daylight.</Text>
                    <Text style={styles.deckTipsItem}>• Hold the camera at eye level, relax your expression, and hold steady.</Text>
                    <Text style={styles.deckTipsItem}>• Clean your camera lens to avoid oil smudges affecting analysis.</Text>
                  </View>
                </BlurView>

                {/* Medical Disclaimer Banner */}
                <View style={styles.disclaimerContainer}>
                  <Text style={styles.disclaimerText}>
                    ⚠️ Cosmetic Assessment Disclaimer: This is an aesthetic visual analysis. It does not provide medical skin diagnosis or health prescriptions. If you have concerns about skin pathology or health, consult a dermatologist.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* INSIGHTS TAB */}
        {activeTab === 'insights' && (
          <View style={styles.tabContentContainer}>
            {currentScan ? (
              <View>
                {/* Redesigned unified insights layout - no blocky nested cards, modern 2026 UI */}
                <View style={styles.unifiedPageLayout}>
                  <Text style={styles.scanDateHeader}>
                    Assessment Report • {new Date(currentScan.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </Text>
                  
                  {/* Central Glassmorphic Gauge Panel */}
                  <View style={styles.unifiedGaugeContainer}>
                    <View style={styles.circularGauge}>
                      <LinearGradient
                        colors={[COLORS.rosePrimary, COLORS.roseDark]}
                        style={styles.circularGaugeGradient}
                      >
                        <View style={styles.circularGaugeInner}>
                          <Text style={styles.gaugeScoreText}>{currentScan.scores.overall}</Text>
                          <Text style={styles.gaugeScoreLabel}>Overall Index</Text>
                        </View>
                      </LinearGradient>
                    </View>

                    <View style={styles.primaryConcernBadge}>
                      <Text style={styles.primaryConcernText}>
                        🎯 Focus Zone: {getPrimaryConcern(currentScan.scores)}
                      </Text>
                    </View>
                  </View>
 
                  <Text style={styles.generalSummaryText}>{currentScan.general_summary}</Text>
                </View>

                {/* Interactive Face Map Coordinates Overlay - Clean inline layout */}
                <View style={styles.unifiedMapLayout}>
                  <Text style={styles.faceMapTitle}>Localized Concerns Map</Text>
                  <Text style={styles.faceMapSubtitle}>Tap scanning targets on your face map below</Text>
                  
                  <View style={styles.facePhotoWrapper}>
                    <Image
                      source={{
                        uri: currentScan.imageUrl || lastScanImageBase64 || 'https://images.unsplash.com/photo-1590156546746-c599f5244cd7?auto=format&fit=crop&w=600&q=80'
                      }}
                      style={[styles.facePhotoImg, currentScan.isFrontFacing && { transform: [{ scaleX: -1 }] }]}
                      resizeMode="cover"
                    />
                    
                    {/* High-tech diagnostic grid overlay lines */}
                    <View style={styles.scanGridOverlay} pointerEvents="none">
                      <View style={styles.scanGridRow} />
                      <View style={styles.scanGridRow} />
                      <View style={styles.scanGridRow} />
                      <View style={[styles.scanGridCol, { left: '25%' }]} />
                      <View style={[styles.scanGridCol, { left: '50%' }]} />
                      <View style={[styles.scanGridCol, { left: '75%' }]} />
                      
                      {/* Circular target scan boundary ring */}
                      <View style={styles.scanTargetRing} />
                      <View style={styles.scanCrosshairV} />
                      <View style={styles.scanCrosshairH} />
                    </View>
                    
                    {/* Hotspot markers overlay */}
                    {currentScan.detections && currentScan.detections.map((det, idx) => {
                      const isActive = activeDetection?.label === det.label;
                      const leftPos = currentScan.isFrontFacing ? (100 - det.x) : det.x;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.hotspotDot,
                            { left: `${leftPos}%`, top: `${det.y}%` },
                            isActive && styles.hotspotDotActive
                          ]}
                          onPress={() => setActiveDetection(det)}
                        >
                          <Text style={styles.hotspotDotEmoji}>
                            {det.type === 'pores' ? '🔍' : det.type === 'dry' ? '💧' : det.type === 'redness' ? '🔴' : det.type === 'lines' ? '🌸' : '⛱️'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  
                  {/* Active detection indicator tooltip details */}
                  {activeDetection ? (
                    <View style={styles.activeConcernOverlayCard}>
                      <View style={styles.activeConcernRow}>
                        <Text style={styles.activeConcernLabel}>
                          {activeDetection.type === 'pores' ? '🔍' : activeDetection.type === 'dry' ? '💧' : activeDetection.type === 'redness' ? '🔴' : activeDetection.type === 'lines' ? '🌸' : '⛱️'}{' '}
                          {activeDetection.label}
                        </Text>
                        <TouchableOpacity onPress={() => setActiveDetection(null)}>
                          <Text style={styles.closeConcernText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.activeConcernDescription}>{activeDetection.description}</Text>
                    </View>
                  ) : (
                    <View style={styles.noActiveConcernCard}>
                      <Text style={styles.noActiveConcernText}>
                        💡 Tap scanning targets highlighted on your face map to load localized diagnostics.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Delta compare warning if multiple scans exist */}
                {scans.length >= 2 && currentScan.id === scans[0].id && (
                  <BlurView intensity={75} tint="light" style={styles.compareDeltaCard}>
                    <Text style={styles.compareDeltaTitle}>Scan Progress Delta (vs previous scan)</Text>
                    <View style={styles.deltaListRow}>
                      {['hydration', 'texture', 'pores'].map(dim => {
                        const delta = getDeltaString(dim as any);
                        if (!delta) return null;
                        const meta = DIMENSION_METADATA[dim as keyof typeof DIMENSION_METADATA];
                        return (
                          <View key={dim} style={styles.deltaItemCol}>
                            <Text style={styles.deltaItemLabel}>
                              {meta.icon} {dim === 'hydration' ? 'Hydration' : dim === 'texture' ? 'Texture' : 'Pores'}
                            </Text>
                            <Text style={[styles.deltaItemValue, { color: delta.color }]}>{delta.text}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </BlurView>
                )}
 
                {/* Breakdown cards for dimensions */}
                <Text style={styles.sectionHeaderTitle}>Skin Dimension Breakdowns</Text>
                {Object.keys(DIMENSION_METADATA).map(dimKey => {
                  const score = currentScan.scores[dimKey as keyof ScanScores];
                  const explanation = currentScan.explanations[dimKey as keyof ScanExplanations];
                  const metadata = DIMENSION_METADATA[dimKey as keyof typeof DIMENSION_METADATA];
                  const status = getMetricStatus(dimKey, score);
                  const isExpanded = expandedDim === dimKey;

                  return (
                    <TouchableOpacity
                      key={dimKey}
                      activeOpacity={0.85}
                      onPress={() => setExpandedDim(isExpanded ? null : dimKey)}
                    >
                      <BlurView intensity={75} tint="light" style={styles.dimensionCard}>
                        {/* Header Row - Redesigned to prevent horizontal overflow */}
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

                        {/* Sub-header row for Status Badge & Delta Comparison */}
                        <View style={styles.dimSubHeaderRow}>
                          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                          </View>
                          {scans.length >= 2 && currentScan.id === scans[0].id && getDeltaString(dimKey as any) && (
                            <Text style={[styles.dimDeltaText, { color: getDeltaString(dimKey as any)!.color }]}>
                              {getDeltaString(dimKey as any)!.text}
                            </Text>
                          )}
                        </View>

                        {/* Interactive Progress Slider */}
                        <View style={styles.metricProgressBg}>
                          <View style={[styles.metricProgressFill, { width: `${score}%`, backgroundColor: metadata.color }]} />
                        </View>

                        {/* Expandable Clinical Breakdowns */}
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
                              <Text style={styles.cardActionLinkText}>View Matching Catalog Products 🧴 →</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={styles.tapToExpandText}>Tap card to review clinical analysis & actives plan</Text>
                        )}
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateTitle}>No Analysis Data Yet</Text>
                <Text style={styles.emptyStateText}>Take your first scan check in the Camera tab to generate insights.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setActiveTab('camera')}>
                  <Text style={styles.primaryButtonText}>Scan My Skin Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* JOURNEY TAB */}
        {activeTab === 'journey' && (
          <View style={styles.tabContentContainer}>
            <Text style={styles.tabTitle}>Skin Journey Timeline</Text>
            <Text style={styles.tabSubtitle}>Track visual progress indicators and score variations scan-to-scan.</Text>

            {/* Score Trend Line Graph */}
            <Text style={styles.sectionHeaderTitle}>Overall Health Trend</Text>
            {renderSVGHistoryChart()}

            {/* Timeline listing */}
            <Text style={styles.sectionHeaderTitle}>Scan History</Text>
            {scans.length > 0 ? (
              scans.map((scan, index) => {
                const dateStr = new Date(scan.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                const isActive = currentScan?.id === scan.id;

                return (
                  <TouchableOpacity
                    key={scan.id}
                    onPress={() => {
                      setCurrentScan(scan);
                      setActiveTab('insights');
                    }}
                  >
                    <BlurView intensity={75} tint="light" style={[styles.historyTimelineCard, isActive && styles.historyTimelineCardActive]}>
                      <View style={styles.historyRow}>
                        <View style={styles.historyTextCol}>
                          <Text style={styles.historyDate}>{dateStr}</Text>
                          <Text style={styles.historyGoals}>
                            {index === scans.length - 1 ? 'Baseline Scan' : `Scan #${scans.length - index}`}
                          </Text>
                        </View>
                        <View style={styles.historyScoreCol}>
                          <Text style={styles.historyScoreVal}>{scan.scores.overall}</Text>
                          <Text style={styles.historyScoreLbl}>Overall</Text>
                        </View>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>Complete your first scan to begin compiling history timeline.</Text>
              </View>
            )}
          </View>
        )}

        {/* PRODUCTS TAB */}
        {activeTab === 'products' && (
          <View style={styles.tabContentContainer}>
            <Text style={styles.tabTitle}>Recommended Products</Text>
            <Text style={styles.tabSubtitle}>
              Curated items mapped to your lowest skin dimensions, available in India.
            </Text>

            {recommendedProducts.length > 0 ? (
              recommendedProducts.map(prod => {
                // Get display colors for mapped dimensions
                const primaryDim = prod.dimensions[0];
                const dimMeta = DIMENSION_METADATA[primaryDim as keyof typeof DIMENSION_METADATA];

                return (
                  <BlurView key={prod.id} intensity={75} tint="light" style={styles.productCard}>
                    <View style={styles.productBadgeContainer}>
                      <Text style={[styles.productBadge, { backgroundColor: dimMeta?.color || COLORS.rosePrimary }]}>
                        Target: {dimMeta?.label || 'General Care'}
                      </Text>
                    </View>
                    
                    <View style={styles.productRow}>
                      <Image source={{ uri: prod.image_url }} style={styles.productImage} />
                      <View style={styles.productInfoCol}>
                        <Text style={styles.productBrand}>{prod.brand}</Text>
                        <Text style={styles.productName}>{prod.name}</Text>
                        <Text style={styles.productPrice}>₹{prod.price_inr}</Text>
                      </View>
                    </View>
 
                    <Text style={styles.productReason}>{prod.reason_text}</Text>
 
                    <TouchableOpacity
                      style={styles.affiliateLinkButton}
                      onPress={async () => {
                        await trackProductClick(prod.id);
                        Alert.alert('Affiliate Link Redirect', `Navigating to shop product on retailer partner...`);
                      }}
                    >
                      <Text style={styles.affiliateBtnText}>Shop Now</Text>
                    </TouchableOpacity>
                    <Text style={styles.affiliateDisclosure}>
                      *Affiliate link — we may earn a small commission on qualifying purchases.
                    </Text>
                  </BlurView>
                );
              })
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>Product recommendations populate once you complete a skin scan.</Text>
              </View>
            )}
          </View>
        )}

        {/* PROFILE/SETTINGS TAB */}
        {activeTab === 'profile' && (
          <View style={styles.tabContentContainer}>
            <Text style={styles.tabTitle}>Account & Settings</Text>

            {/* Profile context preview */}
            <BlurView intensity={75} tint="light" style={styles.profileSummaryCard}>
              <Text style={styles.profileNameTitle}>{profile.name}</Text>
              <Text style={styles.profileMetaLabel}>Age group: {profile.ageRange}</Text>
              <Text style={styles.profileMetaLabel}>Skin type: {profile.skinType || 'Not specified'}</Text>
              <Text style={styles.profileMetaLabel}>
                Goals: {profile.skinGoals.length > 0 ? profile.skinGoals.join(', ') : 'None'}
              </Text>
            </BlurView>
 
            {/* Dev settings */}
            <Text style={styles.sectionHeaderTitle}>Developer Connections</Text>
            <BlurView intensity={75} tint="light" style={styles.devCard}>
              <Text style={styles.devLabel}>Local Server API Endpoint IP Address</Text>
              <TextInput
                style={styles.devInput}
                value={backendUrl}
                onChangeText={setBackendUrl}
                placeholder="http://192.168.1.X:3000"
              />
              <Text style={styles.devHelpText}>
                Use your machine's LAN IP or a public tunnel URL when testing.
              </Text>
              <TouchableOpacity
                style={styles.devSyncButton}
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

            {/* Privacy Actions */}
            <Text style={styles.sectionHeaderTitle}>Privacy & Biometrics Control</Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                Alert.alert(
                  'Confirm Deletion',
                  'This action permanently purges all saved scan metrics, subscription status, and profile tags from servers and your local device. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Delete All Data', 
                      style: 'destructive',
                      onPress: async () => {
                        await clearUserHistory();
                        Alert.alert('Data Purged', 'All skin scan history and profiles deleted successfully.');
                      } 
                    }
                  ]
                );
              }}
            >
              <Text style={styles.deleteButtonText}>Delete My Skin History & Profile</Text>
            </TouchableOpacity>

            {/* Policy & Legal disclaimer */}
            <View style={styles.policyCard}>
              <Text style={styles.policyHeader}>Derma AI Policy Safeguards</Text>
              <Text style={styles.policyDesc}>
                1. Face scans are treated as temporary raw data and analyzed using secure end-to-end HTTPS.
              </Text>
              <Text style={styles.policyDesc}>
                2. We do not store original visual photos permanently unless opted-in. Only tabular metric scores are saved to show trend charts.
              </Text>
              <Text style={styles.policyDesc}>
                3. We never distribute user diagnostics or names to external marketing brokers.
              </Text>
              
              <Text style={styles.policyDisclaimerText}>
                This is a cosmetic assessment utility based on visual indicators. Consult a certified medical dermatologist for clinical skin diseases.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Subscription Paywall Modal */}
      <Modal
        visible={paywallVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPaywallVisible(false)}
      >
        <LinearGradient
          colors={[COLORS.roseLight, '#FFF']}
          style={styles.paywallWrapper}
        >
          <View style={styles.paywallHeader}>
            <TouchableOpacity style={styles.paywallCloseBtn} onPress={() => setPaywallVisible(false)}>
              <Text style={styles.paywallCloseIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.paywallScroll}>
            <Text style={styles.paywallTitle}>Derma AI Pro</Text>
            <Text style={styles.paywallSubtitle}>Unlock Your Complete Skincare Tracker</Text>

            <View style={styles.socialProofBox}>
              <Text style={styles.socialProofText}>Join 15,000+ users tracking skin visual improvements daily.</Text>
            </View>

            {/* Unlocked lists */}
            <View style={styles.perkList}>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Unlimited Skin Scans</Text>
                  <Text style={styles.perkDesc}>Scan daily/weekly without restriction thresholds.</Text>
                </View>
              </View>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Advanced Progress Trend Chart</Text>
                  <Text style={styles.perkDesc}>Review timeline curves for all 7 skin dimensions.</Text>
                </View>
              </View>
              <View style={styles.perkItem}>
                <Text style={styles.perkIcon}>✓</Text>
                <View>
                  <Text style={styles.perkTitle}>Tailored Affiliate Catalog Recommendations</Text>
                  <Text style={styles.perkDesc}>Get direct matching on lowest indicator categories.</Text>
                </View>
              </View>
            </View>

            {/* Pricing Packages */}
            <TouchableOpacity style={styles.priceCard} onPress={() => buySubscription('monthly')}>
              <View style={styles.priceRow}>
                <Text style={styles.priceTier}>Monthly Subscription</Text>
                <Text style={styles.priceVal}>₹149/mo</Text>
              </View>
              <Text style={styles.priceDesc}>Scan freely. Cancel anytime.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.priceCard, styles.priceCardActive]} onPress={() => buySubscription('annual')}>
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>BEST VALUE</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceTier, styles.priceActiveText]}>Annual Plan</Text>
                <Text style={[styles.priceVal, styles.priceActiveText]}>₹999/yr</Text>
              </View>
              <Text style={styles.priceDesc}>Save 44% compared to monthly scans.</Text>
            </TouchableOpacity>

            <Text style={styles.paywallTerms}>
              Payment will be charged to your iTunes Account upon confirmation of mock sandbox click. Subscriptions renew automatically unless cancelled.
            </Text>

            <TouchableOpacity 
              style={[styles.primaryButton, { marginTop: 20 }]}
              onPress={async () => {
                await buySubscription('annual');
                setPaywallVisible(false);
                Alert.alert('Subscription Unlocked', 'Congratulations! You are now a Derma AI Pro member. Unlimited scans unlocked.');
              }}
            >
              <Text style={styles.primaryButtonText}>Activate Sandbox Free Trial</Text>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
      </Modal>

      {/* Custom navigation bottom tabs bar */}
      <BlurView
        intensity={85}
        tint="light"
        style={[styles.bottomTabContainer, { paddingBottom: insets.bottom || 16 }]}
      >
        <View style={styles.bottomTabRow}>
          {/* Animated sliding glass indicator */}
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
            onPress={() => {
              if (scans.length === 0) {
                Alert.alert('No Scan History', 'Perform a skin check scan to unlock insights.');
                return;
              }
              setActiveTab('insights');
            }}
          >
            <Text style={styles.tabBtnIcon}>📊</Text>
            <Text style={[styles.tabBtnText, activeTab === 'insights' && styles.tabBtnTextActive]}>Insights</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'journey' && styles.tabButtonActive]}
            onPress={() => {
              if (scans.length === 0) {
                Alert.alert('No Scan History', 'Perform a skin check scan to unlock journey charts.');
                return;
              }
              setActiveTab('journey');
            }}
          >
            <Text style={styles.tabBtnIcon}>📈</Text>
            <Text style={[styles.tabBtnText, activeTab === 'journey' && styles.tabBtnTextActive]}>Journey</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'products' && styles.tabButtonActive]}
            onPress={() => {
              if (scans.length === 0) {
                Alert.alert('No Scan History', 'Perform a scan first to populate target suggestions.');
                return;
              }
              setActiveTab('products');
            }}
          >
            <Text style={styles.tabBtnIcon}>🧴</Text>
            <Text style={[styles.tabBtnText, activeTab === 'products' && styles.tabBtnTextActive]}>Products</Text>
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  onboardContainer: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  onboardScroll: {
    padding: 24,
    paddingBottom: 60
  },
  onboardHeaderContainer: {
    alignItems: 'center',
    marginVertical: 30
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.roseDark,
    letterSpacing: 2
  },
  subtitleText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4
  },
  onboardCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 24,
    padding: 24,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)'
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginTop: 18,
    marginBottom: 8
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: COLORS.textDark,
    backgroundColor: COLORS.bgLight
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    margin: 4,
    backgroundColor: '#FFF'
  },
  chipActive: {
    backgroundColor: COLORS.rosePrimary,
    borderColor: COLORS.rosePrimary
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500'
  },
  chipTextActive: {
    color: '#FFF',
    fontWeight: '600'
  },
  goalSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FFF'
  },
  goalSelectCardActive: {
    borderColor: COLORS.rosePrimary,
    backgroundColor: COLORS.roseLight
  },
  goalSelectIcon: {
    fontSize: 20,
    marginRight: 12
  },
  goalSelectLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500'
  },
  goalSelectLabelActive: {
    color: COLORS.textDark,
    fontWeight: '600'
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.glassBorder
  },
  checkboxChecked: {
    backgroundColor: COLORS.rosePrimary,
    borderColor: COLORS.rosePrimary
  },
  primaryButton: {
    backgroundColor: COLORS.rosePrimary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: COLORS.rosePrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: COLORS.bgLight
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginTop: 24,
    marginBottom: 8
  },
  loadingSubtitle: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 40
  },
  disclaimerTextSmall: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
    position: 'absolute',
    bottom: 40
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)', // Translucent glassmorphic header
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(242, 160, 161, 0.3)' // Subtle rose glass border
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12
  },
  headerLogo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.roseDark,
    letterSpacing: 1
  },
  headerWelcome: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2
  },
  subscriptionBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12
  },
  badgeActive: {
    backgroundColor: COLORS.goldAccent + '20',
    borderWidth: 1,
    borderColor: COLORS.goldAccent
  },
  badgeFree: {
    backgroundColor: COLORS.greyLight,
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textDark
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
  cameraFrame: {
    flex: 1,
    position: 'relative'
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
    borderColor: COLORS.rosePrimary,
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
  cameraControlsRow: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  secondaryRoundBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnIcon: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },
  captureButtonOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.rosePrimary
  },
  placeholderSpacer: {
    width: 50
  },
  permissionErrorCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF'
  },
  paragraphCenter: {
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 24
  },
  outlineButton: {
    borderWidth: 2,
    borderColor: COLORS.rosePrimary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20
  },
  outlineButtonText: {
    color: COLORS.rosePrimary,
    fontSize: 15,
    fontWeight: 'bold'
  },
  unifiedPageLayout: {
    width: '100%',
    padding: 0,
    marginBottom: 24
  },
  unifiedGaugeContainer: {
    alignItems: 'center',
    marginVertical: 14
  },
  unifiedMapLayout: {
    width: '100%',
    marginBottom: 24
  },
  tabTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 6
  },
  tabSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: 24
  },
  forecastWidget: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2
  },
  forecastHeader: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 16
  },
  forecastGreeting: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.roseDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  forecastTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
    marginTop: 2
  },
  envSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 12,
    padding: 3,
    marginTop: 12,
    width: '100%'
  },
  envSwitchBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9
  },
  envSwitchBtnActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1
  },
  envSwitchText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted
  },
  envSwitchTextActive: {
    color: COLORS.textDark,
    fontWeight: 'bold'
  },
  forecastStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 16
  },
  forecastStatItem: {
    flex: 1,
    alignItems: 'center'
  },
  forecastStatLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4
  },
  forecastStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textDark
  },
  forecastStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.glassBorder
  },
  forecastAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.roseLight + '40',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(242, 160, 161, 0.15)'
  },
  forecastAlertBadge: {
    backgroundColor: '#FFF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  forecastAlertBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: COLORS.roseDark
  },
  forecastAlertTip: {
    fontSize: 11,
    color: COLORS.textDark,
    flex: 1,
    lineHeight: 15
  },
  unifiedScanDeck: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2
  },
  deckTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 4
  },
  deckSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 18
  },
  deckActionsList: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  deckActionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%'
  },
  deckActionRowIcon: {
    fontSize: 20
  },
  deckActionRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark
  },
  deckActionRowDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2
  },
  deckActionRowChevron: {
    fontSize: 14,
    color: COLORS.roseDark,
    fontWeight: 'bold'
  },
  deckActionDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginHorizontal: 16
  },
  deckDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginVertical: 16
  },
  deckConsentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  deckConsentTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 2
  },
  deckConsentDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14
  },
  deckTipsSection: {
    paddingVertical: 2
  },
  deckTipsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 6
  },
  deckTipsItem: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
    marginBottom: 4
  },
  disclaimerContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
    paddingTop: 16
  },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16
  },
  gaugeContainerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20
  },
  scanDateHeader: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
    fontWeight: '600'
  },
  circularGauge: {
    width: 150,
    height: 150,
    borderRadius: 75,
    padding: 4,
    backgroundColor: COLORS.glassBorder,
    marginBottom: 20
  },
  circularGaugeGradient: {
    flex: 1,
    borderRadius: 71,
    justifyContent: 'center',
    alignItems: 'center'
  },
  circularGaugeInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  gaugeScoreText: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.roseDark
  },
  gaugeScoreLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2
  },
  generalSummaryText: {
    fontSize: 14,
    color: COLORS.textDark,
    textAlign: 'center',
    lineHeight: 22
  },
  compareDeltaCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 24
  },
  compareDeltaTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 12
  },
  deltaListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  deltaItemCol: {
    flex: 0.3,
    alignItems: 'center'
  },
  deltaItemLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4
  },
  deltaItemValue: {
    fontSize: 12,
    fontWeight: 'bold'
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginTop: 10,
    marginBottom: 14
  },
  dimensionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3
  },
  dimHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dimScoreColRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dimSubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4
  },
  dimDeltaText: {
    fontSize: 10,
    fontWeight: '600'
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
    color: COLORS.textDark
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
  dimExplanation: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18
  },
  emptyStateCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 8
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  chartContainer: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginBottom: 24,
    alignItems: 'center'
  },
  emptyChartContainer: {
    height: 120,
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24
  },
  emptyChartText: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  gridLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: COLORS.greyLight
  },
  chartDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.roseDark,
    borderWidth: 2,
    borderColor: '#FFF',
    zIndex: 10
  },
  chartValueLabel: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.roseDark,
    width: 24,
    textAlign: 'center'
  },
  chartDateLabel: {
    position: 'absolute',
    fontSize: 10,
    color: COLORS.textMuted,
    width: 30,
    textAlign: 'center'
  },
  chartLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: COLORS.rosePrimary,
    zIndex: 5
  },
  historyTimelineCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)'
  },
  historyTimelineCardActive: {
    borderColor: COLORS.rosePrimary,
    backgroundColor: 'rgba(252, 236, 236, 0.8)'
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  historyTextCol: {
    flex: 0.7
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark
  },
  historyGoals: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2
  },
  historyScoreCol: {
    alignItems: 'center'
  },
  historyScoreVal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.roseDark
  },
  historyScoreLbl: {
    fontSize: 8,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  productCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)'
  },
  productBadgeContainer: {
    flexDirection: 'row',
    marginBottom: 10
  },
  productBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  productRow: {
    flexDirection: 'row',
    marginBottom: 12
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 14,
    backgroundColor: COLORS.greyLight
  },
  productInfoCol: {
    flex: 1,
    justifyContent: 'center'
  },
  productBrand: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase'
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginTop: 2
  },
  productPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.roseDark,
    marginTop: 4
  },
  productReason: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 14
  },
  affiliateLinkButton: {
    backgroundColor: COLORS.rosePrimary,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center'
  },
  affiliateBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold'
  },
  affiliateDisclosure: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 6
  },
  profileSummaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)'
  },
  profileNameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 8
  },
  profileMetaLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4
  },
  devCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)'
  },
  devLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 8
  },
  devInput: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: COLORS.textDark,
    backgroundColor: COLORS.bgLight
  },
  devHelpText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 14
  },
  devSyncButton: {
    backgroundColor: COLORS.roseDark,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  devSyncButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600'
  },
  deleteButton: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: COLORS.roseDark,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20
  },
  deleteButtonText: {
    color: COLORS.roseDark,
    fontSize: 13,
    fontWeight: 'bold'
  },
  policyCard: {
    backgroundColor: COLORS.greyLight,
    padding: 16,
    borderRadius: 16
  },
  policyHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 8
  },
  policyDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
    marginBottom: 6
  },
  policyDisclaimerText: {
    fontSize: 10,
    color: COLORS.roseDark,
    marginTop: 12,
    fontWeight: '500',
    lineHeight: 14
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
    color: COLORS.textDark,
    fontWeight: '600'
  },
  paywallScroll: {
    padding: 24,
    paddingBottom: 60,
    alignItems: 'center'
  },
  paywallTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.roseDark,
    letterSpacing: 1
  },
  paywallSubtitle: {
    fontSize: 15,
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: 16
  },
  socialProofBox: {
    backgroundColor: COLORS.roseLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 24
  },
  socialProofText: {
    fontSize: 12,
    color: COLORS.roseDark,
    fontWeight: '500'
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
    color: COLORS.greenSuccess,
    fontWeight: 'bold',
    marginRight: 14
  },
  perkTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textDark
  },
  perkDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  priceCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: COLORS.glassBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: 'relative'
  },
  priceCardActive: {
    borderColor: COLORS.rosePrimary,
    backgroundColor: COLORS.roseLight + '30'
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  priceTier: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textDark
  },
  priceVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark
  },
  priceActiveText: {
    color: COLORS.roseDark
  },
  priceDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: COLORS.goldAccent,
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
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 14
  },
  bottomTabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.12)', // Ultra-reduced opacity for true glassmorphic backdrop
    borderTopWidth: 1,
    borderTopColor: 'rgba(242, 160, 161, 0.22)', // Subtle rose glass border
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
  tabButtonActive: {
    // Active styling text changes are handled in index.tsx
  },
  activeTabIndicator: {
    position: 'absolute',
    top: 6,
    height: 48,
    width: (SCREEN_WIDTH / 5) - 16,
    borderRadius: 14,
    backgroundColor: 'rgba(242, 160, 161, 0.22)', // Warm rose glass active capsule instead of pure white
    borderWidth: 1.2,
    borderColor: 'rgba(216, 122, 125, 0.35)', // Rose border highlights the boundary beautifully against light background
    overflow: 'hidden',
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1
  },
  primaryConcernBadge: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: COLORS.rosePrimary,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignSelf: 'center',
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2
  },
  primaryConcernText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.roseDark,
    textAlign: 'center'
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignSelf: 'center'
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  chevronIcon: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginLeft: 8,
    alignSelf: 'center'
  },
  metricProgressBg: {
    height: 6,
    width: '100%',
    backgroundColor: COLORS.greyLight,
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
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic'
  },
  expandedContentBlock: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.greyLight,
    paddingTop: 10
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.greyLight,
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
    color: COLORS.textDark,
    width: 90
  },
  ingredientsValue: {
    fontSize: 11,
    color: COLORS.textMuted,
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
    color: COLORS.textDark,
    width: 90
  },
  actionValue: {
    fontSize: 11,
    color: COLORS.textMuted,
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
    color: COLORS.roseDark
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.roseLight,
    borderWidth: 1.5,
    borderColor: COLORS.rosePrimary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.roseDark
  },
  scanGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-around',
    paddingVertical: 30
  },
  scanGridRow: {
    height: 0.8,
    width: '100%',
    backgroundColor: 'rgba(242, 160, 161, 0.22)'
  },
  scanGridCol: {
    width: 0.8,
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(242, 160, 161, 0.22)'
  },
  scanTargetRing: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    width: '70%',
    height: '70%',
    borderRadius: 150,
    borderWidth: 1.2,
    borderColor: 'rgba(242, 160, 161, 0.28)',
    borderStyle: 'dashed'
  },
  scanCrosshairV: {
    position: 'absolute',
    top: '42%',
    bottom: '42%',
    left: '50%',
    width: 1.5,
    backgroundColor: COLORS.rosePrimary,
    opacity: 0.45
  },
  scanCrosshairH: {
    position: 'absolute',
    left: '42%',
    right: '42%',
    top: '50%',
    height: 1.5,
    backgroundColor: COLORS.rosePrimary,
    opacity: 0.45
  },
  tabBtnIcon: {
    fontSize: 20
  },
  tabBtnText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 4
  },
  tabBtnTextActive: {
    color: COLORS.roseDark,
    fontWeight: 'bold'
  },
  scannerWrapper: {
    width: SCREEN_WIDTH * 0.75,
    height: SCREEN_WIDTH * 0.75,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.rosePrimary,
    position: 'relative',
    backgroundColor: '#FFF',
    elevation: 6,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    marginTop: 20
  },
  scannerImage: {
    width: '100%',
    height: '100%'
  },
  scannerImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgLight
  },
  laserLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: COLORS.roseDark,
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10
  },
  pulseDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.roseDark,
    borderWidth: 2,
    borderColor: '#FFF',
    marginLeft: -7,
    marginTop: -7,
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 11
  },
  faceMapContainerCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 3,
    width: '100%',
    alignItems: 'stretch'
  },
  faceMapTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
    textAlign: 'center'
  },
  faceMapSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 16,
    textAlign: 'center'
  },
  facePhotoWrapper: {
    width: '100%',
    aspectRatio: 1, // Strict 1:1 aspect ratio ensures coordinates map accurately to facial contours
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.greyLight
  },
  facePhotoImg: {
    width: '100%',
    height: '100%'
  },
  hotspotDot: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(216, 122, 125, 0.95)',
    borderWidth: 2,
    borderColor: '#FFF',
    marginLeft: -14,
    marginTop: -14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.roseDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    elevation: 4,
    zIndex: 15
  },
  hotspotDotActive: {
    backgroundColor: COLORS.textDark,
    borderColor: COLORS.goldAccent,
    transform: [{ scale: 1.25 }]
  },
  hotspotDotEmoji: {
    fontSize: 12,
    color: '#FFF'
  },
  activeConcernOverlayCard: {
    width: '100%',
    backgroundColor: COLORS.roseLight + '50',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.roseMuted,
    padding: 14,
    marginTop: 16
  },
  activeConcernRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  activeConcernLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.roseDark
  },
  closeConcernText: {
    fontSize: 12,
    color: COLORS.textMuted,
    padding: 4,
    fontWeight: 'bold'
  },
  activeConcernDescription: {
    fontSize: 12,
    color: COLORS.textDark,
    lineHeight: 18
  },
  noActiveConcernCard: {
    width: '100%',
    backgroundColor: COLORS.bgLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 12,
    marginTop: 16
  },
  noActiveConcernText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16
  },
  authTabsRow: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 14,
    padding: 4
  },
  authTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10
  },
  authTabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1
  },
  authTabText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textMuted
  },
  authTabActiveText: {
    color: COLORS.roseDark
  }
});
