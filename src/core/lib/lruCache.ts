// Cache mémoire borné (le moins récemment utilisé est évincé) : les caches de
// session de tmdb.ts grossissaient sans limite au fil d'une longue session
// (audit M10). Même interface que la sous-partie de Map qu'ils utilisent.
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly maxEntries: number) {}

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      // Réinsertion : l'entrée redevient la plus récente.
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): this {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    return this;
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
