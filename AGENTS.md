# AGENTS.md

## Project Context

This is a production-style monitoring platform.

Stack:
- Backend: Go
- Frontend: React
- Database: PostgreSQL

## Engineering Principles

- Act as a senior software engineer.
- Understand existing code before making changes.
- Preserve existing architecture and patterns.
- Prefer minimal, targeted fixes over large rewrites.
- Do not change unrelated files.

## Before Editing

Before modifying code:
- inspect relevant files
- understand data flow
- identify root cause
- consider side effects

## Code Quality

- Write clean, maintainable code.
- Avoid duplicate logic.
- Follow existing naming conventions.
- Keep functions focused.

## Debugging

When fixing bugs:
- reproduce or reason about the issue first
- fix the root cause, not only symptoms
- verify the result after changes

## Verification

After changes:
- check for compile errors
- run relevant tests/build commands
- summarize what changed