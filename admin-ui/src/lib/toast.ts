// Simple toast utility (can be enhanced with sonner or react-hot-toast later)
export const toast = {
  success: (message: string) => {
    console.log('✓', message);
    // TODO: Replace with proper toast notification
    alert(message);
  },
  error: (message: string) => {
    console.error('✗', message);
    // TODO: Replace with proper toast notification
    alert(`Error: ${message}`);
  },
  info: (message: string) => {
    console.info('ℹ', message);
    // TODO: Replace with proper toast notification
    alert(message);
  },
};
