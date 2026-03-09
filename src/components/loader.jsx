import React from 'react';

const Loader = ({ message = "Loading..." }) => {
    return (
        <div className="flex flex-col justify-center items-center w-full min-h-[300px]">
            <div className="relative flex justify-center items-center w-24 h-24 mb-4">
                {/* Spinning border circle */}
                <div className="absolute inset-0 rounded-full border-t-4 border-b-4 border-blue-500 animate-spin"></div>
                
                {/* Pulsing logo - Changed object-cover to object-contain and added padding/bg */}
                <img 
                    src="/logo.png" 
                    alt="Loading Logo" 
                    className="w-20 h-20 rounded-full object-contain bg-white p-2 animate-pulse" 
                />
            </div>
            <p className="text-gray-500 font-semibold text-sm animate-pulse">{message}</p>
        </div>
    );
};

export default Loader;