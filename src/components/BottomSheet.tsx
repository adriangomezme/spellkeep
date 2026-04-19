import { useCallback, useRef, useEffect, useMemo } from 'react';
import { StyleSheet, Keyboard, Platform } from 'react-native';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { colors, spacing, borderRadius } from '../constants';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Fixed snap points (e.g. ['50%', '90%']). Overrides dynamic sizing. */
  snapPoints?: (string | number)[];
  /** Called when the sheet snaps to a different index */
  onSnapChange?: (index: number) => void;
};

export function BottomSheet({ visible, onClose, children, snapPoints, onSnapChange }: Props) {
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const memoizedSnapPoints = useMemo(() => snapPoints, [snapPoints?.join(',')]);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.3}
        pressBehavior="close"
      />
    ),
    []
  );

  if (!visible) return null;

  const useDynamic = !memoizedSnapPoints;

  return (
    <GorhomBottomSheet
      ref={sheetRef}
      index={0}
      {...(useDynamic
        ? { enableDynamicSizing: true }
        : { snapPoints: memoizedSnapPoints, enableDynamicSizing: false }
      )}
      enablePanDownToClose
      onClose={handleClose}
      onChange={onSnapChange}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
      keyboardBehavior={Platform.OS === 'ios' ? 'interactive' : 'extend'}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={[styles.content, !useDynamic && styles.contentFill]}>
        {children}
      </BottomSheetView>
    </GorhomBottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  handle: {
    backgroundColor: colors.border,
    width: 36,
    height: 4,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  contentFill: {
    flex: 1,
  },
});
