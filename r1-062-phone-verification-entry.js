import { registerRootComponent } from 'expo';
import React, { useState } from 'react';
import { UploadStatusPreview } from './r1-122-upload-status-preview';

export function TestEntry() {
  const [openApp, setOpenApp] = useState(false);
  if (openApp) {
    const App = require('./App').default;
    return <App />;
  }
  return <UploadStatusPreview onOpenTestApp={() => setOpenApp(true)} />;
}

registerRootComponent(TestEntry);
