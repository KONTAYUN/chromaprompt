import React, { useRef, useState } from 'react';
import { UploadCloud, X, Pipette, Plus, Check } from 'lucide-react';
import { UploadedImage } from '../types';
import { rgbToHex } from '../utils/colorExtractor';

interface ImageUploaderProps {
  images: UploadedImage[];
  activeImageId: string | null;
  onSelectActiveImage: (id: string) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onSampledColorAdd?: (hex: string) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  activeImageId,
  onSelectActiveImage,
  onAddImages,
  onRemoveImage,
  onSampledColorAdd,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [copiedSample, setCopiedSample] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElementRef = useRef<HTMLImageElement>(null);

  const activeImage = images.find((img) => img.id === activeImageId) || images[0];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddImages(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(Array.from(e.target.files));
    }
  };

  // Color picker on active image
  const handleMouseMoveOnImage = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isEyedropperActive) return;

    const img = imgElementRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Normalizing coordinates to actual image dimensions
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    const canvas = canvasRef.current || document.createElement('canvas');
    if (!canvasRef.current) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const pixel = ctx.getImageData(Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 1).data;
      const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
      setHoverColor(hex);
      setHoverPos({ x: e.clientX, y: e.clientY });
    } catch (err) {
      // Cross-origin fallback
    }
  };

  const handleImageClick = () => {
    if (isEyedropperActive && hoverColor) {
      navigator.clipboard.writeText(hoverColor);
      setCopiedSample(hoverColor);
      if (onSampledColorAdd) {
        onSampledColorAdd(hoverColor);
      }
      setTimeout(() => setCopiedSample(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Upload & Dropzone Area */}
      <div
        id="upload-section"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border rounded-2xl p-6 text-center transition-all ${
          isDragging
            ? 'border-indigo-400 bg-indigo-500/10 scale-[1.005]'
            : 'border-white/[0.1] hover:border-indigo-400/50 bg-white/[0.025]'
        }`}
      >
        {images.length === 0 ? (
          <div className="py-10 space-y-5">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 flex items-center justify-center mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-100">
                拖入参考图片
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">JPG / PNG / WEBP</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
            >
              浏览本地图片文件
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header controls for uploaded images */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-left pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">已载入参考图</span>
                <span className="text-xs text-slate-500">共 {images.length} 张</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEyedropperActive(!isEyedropperActive)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                    isEyedropperActive
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Pipette className="w-3.5 h-3.5" />
                  <span>{isEyedropperActive ? '吸色模式已开启（移动鼠标取色）' : '开启画布吸色器'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>追加参考图</span>
                </button>
              </div>
            </div>

            {/* Thumbnail carousel strip */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {images.map((img) => {
                const isActive = img.id === activeImageId;
                return (
                  <div
                    key={img.id}
                    onClick={() => onSelectActiveImage(img.id)}
                    className={`group relative w-24 h-20 rounded-lg overflow-hidden shrink-0 border-2 cursor-pointer transition-all ${
                      isActive
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-105'
                        : 'border-slate-800 hover:border-slate-700 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(img.id);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-950/80 hover:bg-red-500 text-slate-300 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="移除此图"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {isActive && (
                      <span className="absolute bottom-1 left-1 bg-indigo-600 text-[10px] text-white px-1 rounded font-medium">
                        当前主图
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active Image Stage with Eyedropper Magnifier */}
            {activeImage && (
              <div
                id="eyedropper-section"
                className="relative mt-4 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center max-h-[480px]"
              >
                <img
                  ref={imgElementRef}
                  src={activeImage.dataUrl}
                  alt={activeImage.name}
                  referrerPolicy="no-referrer"
                  onMouseMove={handleMouseMoveOnImage}
                  onClick={handleImageClick}
                  className={`max-w-full max-h-[480px] object-contain select-none ${
                    isEyedropperActive ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                />

                {/* Floating Eyedropper Tooltip */}
                {isEyedropperActive && hoverColor && hoverPos && (
                  <div
                    className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-16 flex items-center gap-2 bg-slate-950/95 border border-slate-700 rounded-lg px-2.5 py-1.5 shadow-2xl backdrop-blur-md"
                    style={{ left: hoverPos.x, top: hoverPos.y }}
                  >
                    <div
                      className="w-5 h-5 rounded border border-white/30 shrink-0"
                      style={{ backgroundColor: hoverColor }}
                    />
                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      {hoverColor}
                    </span>
                    <span className="text-[10px] text-amber-400 font-medium">点击采样并复制</span>
                  </div>
                )}

                {/* Copied toast notification */}
                {copiedSample && (
                  <div className="absolute top-4 right-4 bg-emerald-500/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xl backdrop-blur-sm animate-fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>已复制吸取色号: {copiedSample}</span>
                  </div>
                )}

                {/* Active image overlay toolbar */}
                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-slate-800 text-xs text-slate-300 flex items-center gap-3">
                  <span className="truncate max-w-[200px] font-medium">{activeImage.name}</span>
                  {activeImage.sizeFormatted && (
                    <span className="text-slate-500">{activeImage.sizeFormatted}</span>
                  )}
                  {isEyedropperActive && (
                    <span className="text-amber-400 font-medium">· 画板吸色已启用</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
