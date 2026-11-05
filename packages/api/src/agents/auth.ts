import { logger, decrypt } from '@librechat/data-schemas';
import type { IPluginAuth, PluginAuthMethods } from '@librechat/data-schemas';

export interface GetPluginAuthMapParams {
  userId: string;
  pluginKeys: string[];
  throwError?: boolean;
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
}

export type PluginAuthMap = Record<string, Record<string, string>>;

/** Convert dynamic plugin/field names without invoking object property setters. */
function toPluginAuthMap(entries: Map<string, Map<string, string>>): PluginAuthMap {
  const safeEntries = Array.from(entries, ([pluginKey, fields]) => [
    pluginKey,
    Object.setPrototypeOf(Object.fromEntries(fields), null),
  ]);
  return Object.setPrototypeOf(Object.fromEntries(safeEntries), null) as PluginAuthMap;
}

/**
 * Retrieves and decrypts authentication values for multiple plugins
 * @returns A map where keys are pluginKeys and values are objects of authField:decryptedValue pairs
 */
export async function getPluginAuthMap({
  userId,
  pluginKeys,
  throwError = true,
  findPluginAuthsByKeys,
}: GetPluginAuthMapParams): Promise<PluginAuthMap> {
  try {
    /** Early return for empty plugin keys */
    if (!pluginKeys?.length) {
      return {};
    }

    /** All plugin auths for current user query */
    const pluginAuths = await findPluginAuthsByKeys({ userId, pluginKeys });

    /** Group auth records by pluginKey for efficient lookup */
    const authsByPlugin = new Map<string, IPluginAuth[]>();
    for (const auth of pluginAuths) {
      if (!auth.pluginKey) {
        logger.warn(`[getPluginAuthMap] Missing pluginKey for userId ${userId}`);
        continue;
      }
      const existing = authsByPlugin.get(auth.pluginKey) || [];
      existing.push(auth);
      authsByPlugin.set(auth.pluginKey, existing);
    }

    const authMap = new Map<string, Map<string, string>>();
    const decryptionPromises: Promise<void>[] = [];

    /** Single loop through requested pluginKeys */
    for (const pluginKey of pluginKeys) {
      const authFields = new Map<string, string>();
      authMap.set(pluginKey, authFields);
      const auths = authsByPlugin.get(pluginKey) || [];

      for (const auth of auths) {
        decryptionPromises.push(
          (async () => {
            try {
              const decryptedValue = await decrypt(auth.value);
              authFields.set(auth.authField, decryptedValue);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              logger.error(
                `[getPluginAuthMap] Decryption failed for userId ${userId}, plugin ${pluginKey}, field ${auth.authField}: ${message}`,
              );

              if (throwError) {
                throw new Error(
                  `Decryption failed for plugin ${pluginKey}, field ${auth.authField}: ${message}`,
                );
              }
            }
          })(),
        );
      }
    }

    await Promise.all(decryptionPromises);
    return toPluginAuthMap(authMap);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const plugins = pluginKeys?.join(', ') ?? 'all requested';
    logger.warn(
      `[getPluginAuthMap] Failed to fetch auth values for userId ${userId}, plugins: ${plugins}: ${message}`,
    );
    if (!throwError) {
      /** Empty objects for each plugin key on error */
      return toPluginAuthMap(
        new Map(pluginKeys.map((pluginKey) => [pluginKey, new Map<string, string>()])),
      );
    }
    throw error;
  }
}
