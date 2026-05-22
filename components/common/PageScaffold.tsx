import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function PageScaffold({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>{title}</Typography>
        {description ? <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>{description}</Typography> : null}
      </Box>
      <Card>
        <CardContent sx={{ p: 2.2, '&:last-child': { pb: 2.2 } }}>
          {children ?? <Alert severity='info'>พร้อมใช้งานโมดูลนี้แล้ว</Alert>}
        </CardContent>
      </Card>
    </Stack>
  );
}

export function SimpleSearchBar() {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField fullWidth label='ค้นหา' size='small' />
      <Button variant='contained'>ค้นหา</Button>
    </Stack>
  );
}
