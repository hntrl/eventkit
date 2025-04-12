import { DurableObject as DurableObjectPrimitive } from "cloudflare:workers";

export const iife = <T>(fn: () => T): T => fn();

export function DurableObject<TEnv>(accessor: keyof TEnv) {
  return class DurableObject extends DurableObjectPrimitive<TEnv> {
    /**
     * Retrieves a durable object stub for a given id.
     *
     * @template T - The type of the DurableObject.
     * @param {TEnv} env - The env object containing the durable object's namespace.
     * @param {DurableObjectId | string} [id] - The id of the DurableObject. If not provided, `newUniqueId()` will be used.
     * @returns {DurableObjectStub<T>} The DurableObjectStub for the given id.
     */
    static getStub<T extends DurableObjectPrimitive>(
      this: { new (...args: any[]): T },
      env: TEnv,
      id?: DurableObjectId | string
    ): DurableObjectStub<T> {
      const namespace = env[accessor] as DurableObjectNamespace<T>;
      const stubId = iife(() => {
        if (!id) return namespace.newUniqueId();
        if (typeof id === "string") {
          // Check if the provided id is a string representation of the
          // 256-bit Durable Object ID
          if (id.match(/^[0-9a-f]{64}$/)) return namespace.idFromString(id);
          else return namespace.idFromName(id);
        }
        return id;
      });
      const stub = namespace.get(stubId);
      return stub;
    }
  };
}
