// Photo de profil personnelle : recadrée par l'utilisateur (voir
// AvatarCropDialog) en carré de 256 px et réencodée en JPEG dans le
// navigateur, avant envoi. Une photo de téléphone (plusieurs Mo) devient
// ainsi quelques dizaines de Ko, assez petit pour être stocké tel quel en D1
// (voir worker/avatars.ts), et le réencodage retire au passage les
// métadonnées EXIF (position GPS comprise).

const AVATAR_SIZE = 256;
const JPEG_QUALITY = 0.85;
/** Zoom maximal du recadrage, relatif à l'image entière (zoom 1). */
export const AVATAR_MAX_ZOOM = 4;

/**
 * Cadrage : centre du carré retenu, en pixels de l'image source, et zoom
 * (1 = le plus grand carré possible, AVATAR_MAX_ZOOM = un carré 4× plus
 * petit).
 */
export interface AvatarCrop {
  centerX: number;
  centerY: number;
  zoom: number;
}

export function loadAvatarSource(file: File): Promise<ImageBitmap> {
  // `imageOrientation: "from-image"` applique l'orientation EXIF : sans ça,
  // une photo prise en portrait sur iPhone ressortirait couchée.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** Cadrage initial : image entière, centrée. */
export function initialAvatarCrop(image: ImageBitmap): AvatarCrop {
  return { centerX: image.width / 2, centerY: image.height / 2, zoom: 1 };
}

/**
 * Ramène le zoom dans [1, AVATAR_MAX_ZOOM] et le centre de sorte que le carré
 * reste entièrement dans l'image.
 */
export function clampAvatarCrop(image: ImageBitmap, crop: AvatarCrop): AvatarCrop {
  const zoom = Math.min(AVATAR_MAX_ZOOM, Math.max(1, crop.zoom));
  const half = avatarCropSide(image, zoom) / 2;
  const clamp = (value: number, max: number) => Math.min(max - half, Math.max(half, value));
  return {
    zoom,
    centerX: clamp(crop.centerX, image.width),
    centerY: clamp(crop.centerY, image.height),
  };
}

/** Côté du carré retenu, en pixels de l'image source. */
export function avatarCropSide(image: ImageBitmap, zoom: number): number {
  return Math.min(image.width, image.height) / zoom;
}

/** Dessine le carré retenu sur tout le canvas (aperçu comme export). */
export function drawAvatarCrop(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  crop: AvatarCrop,
  size: number
) {
  const side = avatarCropSide(image, crop.zoom);
  // Fond blanc : le JPEG n'a pas de transparence, un PNG détouré
  // ressortirait sur fond noir.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.centerX - side / 2,
    crop.centerY - side / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );
}

export async function renderAvatarImage(image: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas 2d indisponible");
  }
  drawAvatarCrop(context, image, crop, AVATAR_SIZE);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encodage JPEG impossible"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}
