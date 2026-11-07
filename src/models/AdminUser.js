import mongoose from "mongoose";

const adminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, enum: ["admin"], default: "admin" },
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { collection: "admin_users", timestamps: true },
);

export const AdminUser = mongoose.model("AdminUser", adminUserSchema);
