import { registerRootComponent } from 'expo';
import React, { useState } from 'react';
import { UploadUiPreview } from './r1-118-upload-preview';

export function TestEntry() {
  const [openApp, setOpenApp] = useState(false);
  if (openApp) {
    const App = require('./App').default;
    return <App />;
  }
  return <UploadUiPreview onOpenTestApp={() => setOpenApp(true)} />;
}

registerRootComponent(TestEntry);
