<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChannelController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\ServerController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VoiceController;
use App\Http\Middleware\EnsureAdmin;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/servers', [ServerController::class, 'index']);
    Route::post('/servers', [ServerController::class, 'store']);
    Route::put('/servers/{server}', [ServerController::class, 'update']);
    Route::post('/servers/verify', [ServerController::class, 'verify']);
    Route::get('/servers/{server}/members', [ServerController::class, 'members']);
    Route::post('/servers/{server}/remove/{user}', [ServerController::class, 'kick']);
    Route::post('/servers/{server}/ban/{user}', [ServerController::class, 'ban']);
    Route::get('/servers/{server}/roles', [RoleController::class, 'index']);
    Route::post('/servers/{server}/roles', [RoleController::class, 'store']);
    Route::put('/roles/{role}', [RoleController::class, 'update']);
    Route::delete('/roles/{role}', [RoleController::class, 'destroy']);
    Route::put('/servers/{server}/members/{user}/role', [RoleController::class, 'assign']);

    Route::get('/servers/{server}/voice/presence', [VoiceController::class, 'presence']);
    Route::get('/servers/{server}/channels', [ChannelController::class, 'index']);
    Route::post('/servers/{server}/channels', [ChannelController::class, 'store']);
    Route::put('/channels/{channel}', [ChannelController::class, 'update']);
    Route::delete('/channels/{channel}', [ChannelController::class, 'destroy']);

    Route::get('/channels/{channel}/messages', [MessageController::class, 'index']);
    Route::post('/channels/{channel}/messages', [MessageController::class, 'store']);

    Route::post('/channels/{channel}/voice/join', [VoiceController::class, 'join']);
    Route::post('/channels/{channel}/voice/leave', [VoiceController::class, 'leave']);
    Route::post('/channels/{channel}/voice/heartbeat', [VoiceController::class, 'heartbeat']);
    Route::put('/channels/{channel}/voice/screen', [VoiceController::class, 'updateScreen']);
    Route::post('/channels/{channel}/voice/kick/{user}', [VoiceController::class, 'kickFromCall']);
    Route::post('/channels/{channel}/voice/mute/{user}', [VoiceController::class, 'muteInCall']);
    Route::get('/channels/{channel}/voice/peers', [VoiceController::class, 'peers']);
    Route::get('/channels/{channel}/voice/signals', [VoiceController::class, 'signals']);
    Route::post('/channels/{channel}/voice/signals', [VoiceController::class, 'sendSignal']);

    Route::middleware(EnsureAdmin::class)->prefix('admin')->group(function (): void {
        Route::get('/servers', [ServerController::class, 'adminIndex']);
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::post('/users/{user}/ban', [UserController::class, 'ban']);
        Route::post('/users/{user}/unban', [UserController::class, 'unban']);
    });
});
