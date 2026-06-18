export const colors = {
  // Dark first Neutral tokens (Slate)
  background: '#090D16',       // Deep Slate background
  surface: '#111827',          // Slate Surface
  surfaceDim: '#090D16',
  surfaceLow: '#1F2937',        // Elevated Slate Low
  surfaceContainer: '#1F2937',  // Elevated Slate Container
  surfaceHigh: '#374151',       // High Contrast Slate
  onSurface: '#F9FAFB',         // Pure Ink White
  onSurfaceVariant: '#9CA3AF',  // Muted Gray
  
  // Brand tokens (Calibrated Brand Blue, Saturation ~72%)
  primary: '#2563EB',           
  primaryContainer: '#60A5FA',  
  secondary: '#9CA3AF',         
  outline: '#1F2937',           
  outlineVariant: '#374151',    

  // Status tokens (Calibrated green, red, orange under 80% saturation)
  success: '#059669',
  successSoft: '#064e3b',
  successMedium: '#047857',
  successStrong: '#059669',
  error: '#DC2626',
  errorSoft: '#7f1d1d',
  errorMedium: '#b91c1c',
  errorStrong: '#dc2626',
  tertiary: '#D97706',          // Warning amber
  warningSoft: '#78350f',
  warningMedium: '#b45309',
  warningStrong: '#d97706',

  // Utility
  white: '#F9FAFB',
  black: '#090D16',
  shadow: 'rgba(0, 0, 0, 0.4)',
  
  // Translucent colors for glassmorphism
  glassBg: 'rgba(255, 255, 255, 0.03)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBgActive: 'rgba(255, 255, 255, 0.1)',
};

export const radius = {
  sm: 6,      
  default: 10, 
  base: 16,    
  full: 9999,  
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const type = {
  headline: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.5, // tight tracking for display H1
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  code: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0,
  },
};
