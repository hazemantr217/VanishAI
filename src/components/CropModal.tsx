import React, { useState, useRef } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { canvasToManagedImageUrl } from '../lib/image-urls';

interface CropModalProps {
  imageUrl: string;
  onComplete: (croppedImageUrl: string) => void;
  onCancel: () => void;
}

export default function CropModal({ imageUrl, onComplete, onCancel }: CropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  const handleComplete = async () => {
    if (completedCrop && imgRef.current) {
      const canvas = document.createElement('canvas');
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
      const outputWidth = Math.max(1, Math.round(completedCrop.width * scaleX));
      const outputHeight = Math.max(1, Math.round(completedCrop.height * scaleY));
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          imgRef.current,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          outputWidth,
          outputHeight
        );
        onComplete(await canvasToManagedImageUrl(canvas));
      }
    } else {
      onComplete(imageUrl); // No crop applied
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">قص الصورة</h2>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto flex items-center justify-center bg-black/50 rounded-xl mb-4">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Crop me"
              className="max-w-full max-h-[60vh] object-contain"
            />
          </ReactCrop>
        </div>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
          >
            Skip
          </button>
          <button 
            onClick={handleComplete}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            تطبيق القص
          </button>
        </div>
      </motion.div>
    </div>
  );
}
