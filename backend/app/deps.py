"""FastAPI dependency injection and user mapping from Supabase JWT tokens."""

import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserProfile
from app.supabase_auth import (
    InvalidTokenError,
    SupabaseAuthNotConfiguredError,
    verify_supabase_token,
)

logger = logging.getLogger("becon.auth")

# HTTPBearer scheme that does not auto-error, allowing optional authentication
bearer_scheme = HTTPBearer(auto_error=False)


def extract_bearer_token(request: Request, creds: HTTPAuthorizationCredentials | None = None) -> str | None:
    """Extract bearer token from HTTP Authorization header."""
    if creds and creds.credentials:
        return creds.credentials
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def map_token_to_user(payload: dict, db: Session) -> UserProfile:
    """Map verified Supabase JWT payload claims to a local UserProfile record.

    Logic:
    1. Look up existing user by external_auth_id == sub.
    2. If not found and not anonymous with email: look up by lowercase email.
       If found with NULL external_auth_id, link it to this sub.
       If found with a DIFFERENT external_auth_id, reject with 409 Conflict.
    3. Else create new UserProfile (email NULL for anonymous).
    4. Handle race conditions on concurrent first requests gracefully.
    5. Reject soft-deleted accounts with 401.
    """
    sub = str(payload["sub"])
    is_anonymous = bool(payload.get("is_anonymous", False))
    raw_email = payload.get("email")
    email = raw_email.strip().lower() if (raw_email and isinstance(raw_email, str)) else None

    app_metadata = payload.get("app_metadata") or {}
    user_metadata = payload.get("user_metadata") or {}

    provider = app_metadata.get("provider", "email") if not is_anonymous else "anonymous"

    # Extract clean display name
    name = (
        user_metadata.get("full_name")
        or user_metadata.get("name")
        or ("Guest Reader" if is_anonymous else (email.split("@")[0].capitalize() if email else "User"))
    )

    picture_url = user_metadata.get("avatar_url") or user_metadata.get("picture")

    # 1. Lookup by external_auth_id (fast indexed lookup)
    user = db.query(UserProfile).filter(UserProfile.external_auth_id == sub).first()
    if user:
        if user.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account has been deleted.",
            )
        # Update profile picture or name if newly provided
        updated = False
        if picture_url and user.picture_url != picture_url:
            user.picture_url = picture_url
            updated = True
        if name and user.name in ("User", "", None):
            user.name = name
            updated = True
        if updated:
            try:
                db.commit()
                db.refresh(user)
            except IntegrityError:
                db.rollback()
        return user

    # 2. Account linking for non-anonymous accounts by verified email
    if not is_anonymous and email:
        existing = db.query(UserProfile).filter(func.lower(UserProfile.email) == email).first()
        if existing:
            if existing.deleted_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Account has been deleted.",
                )

            # Link legacy row if it hasn't been bound yet
            if existing.external_auth_id is None:
                existing.external_auth_id = sub
                if not existing.auth_provider or existing.auth_provider in ("local", "email"):
                    existing.auth_provider = provider
                if picture_url and not existing.picture_url:
                    existing.picture_url = picture_url
                try:
                    db.commit()
                    db.refresh(existing)
                    logger.info("Linked existing legacy user account to Supabase sub.")
                    return existing
                except IntegrityError:
                    db.rollback()
                    # Concurrent linking race
                    user = db.query(UserProfile).filter(UserProfile.external_auth_id == sub).first()
                    if user:
                        return user
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="An account conflict occurred during linking.",
                    )

            # Conflict: email matches an account already bound to a different Supabase sub
            if existing.external_auth_id != sub:
                logger.warning(
                    "User linking conflict: account with this email is already bound to another external_auth_id"
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email address is already registered to a different identity.",
                )

    # 3. Create new UserProfile
    new_user = UserProfile(
        external_auth_id=sub,
        email=None if is_anonymous else email,
        is_anonymous=is_anonymous,
        email_digest_enabled=not is_anonymous,
        auth_provider=provider,
        name=name,
        picture_url=picture_url,
        profession_id=None,
        timezone="UTC",
        delivery_time="07:00",
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except IntegrityError:
        db.rollback()
        # Handle concurrent registration race: re-query existing row
        user = db.query(UserProfile).filter(UserProfile.external_auth_id == sub).first()
        if not user and email and not is_anonymous:
            user = db.query(UserProfile).filter(func.lower(UserProfile.email) == email).first()
        if user:
            if user.deleted_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Account has been deleted.",
                )
            return user

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize user session.",
        )


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserProfile:
    """FastAPI dependency requiring a valid Supabase JWT Bearer token."""
    token = extract_bearer_token(request, creds)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = verify_supabase_token(token)
    except SupabaseAuthNotConfiguredError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    return map_token_to_user(payload, db)


def get_optional_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserProfile | None:
    """FastAPI dependency accepting an optional Supabase JWT Bearer token.

    Returns UserProfile if a valid token is provided, None if unauthenticated,
    and raises 401 if a token is provided but invalid/expired.
    """
    token = extract_bearer_token(request, creds)
    if not token:
        return None

    try:
        payload = verify_supabase_token(token)
    except SupabaseAuthNotConfiguredError:
        return None
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    return map_token_to_user(payload, db)
