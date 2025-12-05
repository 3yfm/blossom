import React from 'react';

interface BasketProps {
  count: number;
}

export const Basket: React.FC<BasketProps> = ({ count }) => {
  return (
    <div className="relative group">
      {/* Sparkles Effect on update could go here */}
      <div className="bg-[#FFF5F5] border-2 border-[#FFB7B2] rounded-3xl p-4 w-48 shadow-lg transform transition-transform hover:scale-105">
        <div className="flex items-center space-x-4">
          <div className="bg-[#C7CEEA] p-3 rounded-full flex items-center justify-center shadow-inner">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="currentColor" 
              className="w-8 h-8 text-white"
            >
              <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Collected</p>
            <p className="text-3xl font-serif text-[#CD5A5A] leading-none">
              {count}
            </p>
          </div>
        </div>
        
        {/* Visual Flowers piling up */}
        <div className="absolute -top-6 -right-2 flex -space-x-3 pointer-events-none">
           {count > 0 && <div className="w-8 h-8 rounded-full bg-[#FFB7B2] shadow-sm animate-bounce" style={{animationDelay: '0ms'}}></div>}
           {count > 5 && <div className="w-8 h-8 rounded-full bg-[#A2E1DB] shadow-sm animate-bounce" style={{animationDelay: '100ms'}}></div>}
           {count > 10 && <div className="w-8 h-8 rounded-full bg-[#E2F0CB] shadow-sm animate-bounce" style={{animationDelay: '200ms'}}></div>}
        </div>
      </div>
    </div>
  );
};