'use client';

import { Alert, Snackbar } from '@mui/material';

export type ActionSnackbarSeverity = 'success' | 'error' | 'info' | 'warning';

const colors: Record<ActionSnackbarSeverity, string> = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#0ea5e9',
  warning: '#f59e0b',
};

export function ActionSnackbar({
  open,
  message,
  severity,
  onClose,
}: {
  open: boolean;
  message: string;
  severity: ActionSnackbarSeverity;
  onClose: () => void;
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={3500}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose();
      }}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: 7, mr: { xs: 0, sm: 1 } }}
    >
      <Alert
        severity={severity}
        variant='filled'
        onClose={onClose}
        sx={{
          minWidth: { xs: 280, sm: 360 },
          maxWidth: 520,
          borderRadius: 2.5,
          bgcolor: colors[severity],
          color: '#fff',
          fontWeight: 700,
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
          '& .MuiAlert-icon, & .MuiAlert-action': { color: '#fff' },
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
