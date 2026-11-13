<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class UserController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return UserResource::collection(
            User::query()->orderBy('name')->get(),
        );
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::query()->create([
            'name' => $request->validated('name'),
            'email' => $request->validated('email'),
            'password' => $request->validated('password'),
            'role' => $request->validated('role', User::ROLE_USER),
        ]);

        return (new UserResource($user))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $data = $request->validated();

        if (array_key_exists('password', $data) && blank($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);

        return new UserResource($user->fresh());
    }

    public function ban(Request $request, User $user): UserResource
    {
        $admin = $request->user();

        if ($admin->id === $user->id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Você não pode banir a si mesmo.');
        }

        if ($user->isAdmin()) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Administradores não podem ser banidos.');
        }

        $user->update([
            'is_banned' => true,
            'banned_at' => now(),
        ]);

        $user->tokens()->delete();

        return new UserResource($user->fresh());
    }

    public function unban(User $user): UserResource
    {
        $user->update([
            'is_banned' => false,
            'banned_at' => null,
        ]);

        return new UserResource($user->fresh());
    }
}
