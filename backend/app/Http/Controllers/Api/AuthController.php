<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->validated('email'))->first();

        if (! $user || ! Hash::check($request->validated('password'), $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Credenciais inválidas.'],
            ]);
        }

        if ($user->is_banned) {
            throw ValidationException::withMessages([
                'email' => ['Esta conta está banida.'],
            ]);
        }

        $user->tokens()->delete();
        $token = $user->createToken('hicall')->plainTextToken;

        return response()->json([
            'user' => (new UserResource($user))->resolve(),
            'token' => $token,
        ]);
    }

    public function logout(Request $request): Response
    {
        $token = $request->user()?->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        return response()->noContent();
    }

    public function user(Request $request): UserResource
    {
        return new UserResource($request->user());
    }
}
