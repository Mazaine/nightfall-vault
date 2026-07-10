import { apiClient } from "./client";
import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  PasswordChangeRequest,
  RegisterRequest,
  ResetPasswordRequest,
  User,
  UserProfileUpdateRequest,
} from "../types";

export async function register(payload: RegisterRequest): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/api/auth/register", payload);
  return response.data;
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>("/api/auth/login", payload);
  return response.data;
}

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>("/api/auth/me");
  return response.data;
}

export async function updateMe(payload: UserProfileUpdateRequest): Promise<User> {
  const response = await apiClient.patch<User>("/api/auth/me", payload);
  return response.data;
}

export async function changePassword(payload: PasswordChangeRequest): Promise<MessageResponse> {
  const response = await apiClient.patch<MessageResponse>("/api/auth/me/password", payload);
  return response.data;
}

export async function forgotPassword(payload: ForgotPasswordRequest): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/api/auth/forgot-password", payload);
  return response.data;
}

export async function resetPassword(payload: ResetPasswordRequest): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/api/auth/reset-password", payload);
  return response.data;
}

export async function verifyEmail(token: string): Promise<MessageResponse> {
  const response = await apiClient.get<MessageResponse>("/api/auth/verify-email", {
    params: { token },
  });
  return response.data;
}

export async function deleteMe(password: string): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>("/api/auth/me", {
    data: { password },
  });
  return response.data;
}
