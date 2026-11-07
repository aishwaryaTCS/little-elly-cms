import mongoose from "mongoose";
import { env, redact } from "./env.js";

mongoose.set("strictQuery", true);

export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  } catch (error) {
    throw new Error(redact(error.message));
  }
  console.log("Connected to MongoDB Atlas");
}
