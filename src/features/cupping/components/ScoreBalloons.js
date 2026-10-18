import React, { useCallback, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const BALLOON_CONFIGS = [
  { color: '#E15A64', left: 0.14, size: 34, drift: 20 },
  { color: '#F2B84B', left: 0.32, size: 28, drift: -16 },
  { color: '#61A6D8', left: 0.5, size: 38, drift: 12 },
  { color: '#75B66A', left: 0.68, size: 30, drift: -22 },
  { color: '#C586D9', left: 0.84, size: 35, drift: 15 },
];

export function useScoreBalloons() {
  const animations = useRef(BALLOON_CONFIGS.map(() => new Animated.Value(0))).current;
  const triggerBalloons = useCallback((onComplete) => {
    animations.forEach((animation) => animation.setValue(0));
    Animated.stagger(
      90,
      animations.map((animation) =>
        Animated.timing(animation, {
          toValue: 1,
          duration: 1700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start(({ finished }) => {
      if (finished && typeof onComplete === 'function') onComplete();
    });
  }, [animations]);
  return { animations, triggerBalloons };
}

export function ScoreBalloons({ animations, width, scale }) {
  return <View pointerEvents="none" style={styles.layer}>
    {BALLOON_CONFIGS.map((balloon, index) => {
      const animation = animations[index];
      const translateY = animation.interpolate({ inputRange: [0, 1], outputRange: [0, -640 * scale] });
      const translateX = animation.interpolate({
        inputRange: [0, 0.5, 1], outputRange: [0, balloon.drift * scale, -balloon.drift * scale],
      });
      const opacity = animation.interpolate({ inputRange: [0, 0.1, 0.82, 1], outputRange: [0, 1, 1, 0] });

      return <Animated.View key={balloon.color} style={[styles.balloon, {
        left: width * balloon.left,
        bottom: 92 * scale,
        width: balloon.size * scale,
        height: balloon.size * 1.28 * scale,
        borderRadius: (balloon.size / 2) * scale,
        backgroundColor: balloon.color,
        opacity,
        transform: [{ translateX }, { translateY }],
      }]}>
        <View style={[styles.knot, {
          borderLeftWidth: 5 * scale,
          borderRightWidth: 5 * scale,
          borderTopWidth: 8 * scale,
          bottom: -7 * scale,
          borderTopColor: balloon.color,
        }]} />
      </Animated.View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 80, elevation: 80 },
  balloon: { position: 'absolute', alignItems: 'center' },
  knot: { position: 'absolute', width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
