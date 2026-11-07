import * as models from "../models/content.js";
import { redact } from "../config/env.js";

/**
 * Makes the content collections' indexes match the models (unique slugs, one
 * featured post, unique trending places). Only touches the content collections.
 */
export async function syncContentIndexes() {
  for (const Model of Object.values(models)) {
    try {
      await Model.syncIndexes();
    } catch (error) {
      // A clash (e.g. two featured posts saved before the index existed) must not stop the API.
      console.error(`Index sync for ${Model.collection.name}: ${redact(error.message)}`);
    }
  }
}
