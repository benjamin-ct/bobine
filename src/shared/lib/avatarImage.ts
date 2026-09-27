// Photo de profil personnelle : recadrée au centre en carré de 256 px et
// réencodée en JPEG dans le navigateur, avant envoi. Une photo de téléphone
// (plusieurs Mo) devient ainsi quelques dizaines de Ko, assez petit pour être
// stocké tel quel en D1 (voir worker/avatars.ts), et le réencodage retire au
// passage les métadonnées EXIF (position GPS comprise).

const AVATAR_SIZE = 256;
const JPEG_QUALITY = 0.85;

export async function prepareAvatarImage(file: File): Promise<Blob> {
  // `imageOrientation: "from-image"` applique l'orientation EXIF : sans ça,
  // une photo prise en portrait sur iPhone ressortirait couchée.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas 2d indisponible");
    }
    // Fond blanc : le JPEG n'a pas de transparence, un PNG détouré
    // ressortirait sur fond noir.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encodage JPEG impossible"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  } finally {
    bitmap.close();
  }
}
