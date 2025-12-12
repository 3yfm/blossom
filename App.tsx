import React, { useState, useCallback } from 'react';
import { GenerativeTree } from './components/GenerativeTree';

const App: React.FC = () => {
  const [isCameraReady, setIsCameraReady] = useState(false);

  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#FDFBF7]">
      {/* Background/Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <GenerativeTree 
          onCameraReady={handleCameraReady} 
        />
      </div>

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <header className="flex justify-between items-start pointer-events-auto">
          <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-pink-100 max-w-md">
            <h1 className="text-2xl font-bold text-gray-800 mb-1 font-serif">
              Magic <span className="text-[#FFB7B2]">Blossom</span>
            </h1>
            <p className="text-sm text-gray-600">
              Move your hand to paint with flowers.
            </p>
            {!isCameraReady && (
              <div className="mt-2 text-xs text-orange-500 font-semibold animate-pulse">
                Initializing Vision & Camera...
              </div>
            )}
          </div>
        </header>

        {/* Footer */}
        <footer className="flex justify-end items-end w-full pointer-events-auto pb-4 pr-4">
          {/* Camera feed is handled inside GenerativeTree and positioned absolute bottom-right */}
        </footer>
      </div>
    </div>
  );
};

export default App;