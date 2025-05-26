---
title: How I Organize My Godot Projects
description: A brief overview of how I organize my Godot projects.
keywords: Godot, gamedev, game, development, organization
---

# {title}

_caveat emptor: I am a hobbyist game developer and a professional software engineer._
_The opinions expressed here are just that: opinions. They are just what works for me._

When doing game development in Godot, I like to organize code into a few categories. This helps me keep things organized and easy to find. It also helps with code re-use. Here's a brief overview:

## Interactables

An **interactable** is anything that can respond to direct player interaction, generally by a player looking directly at the interactable and then pressing an `interact` button/key. This can be applied to things like doors to open, buttons to press, NPCs to talk to, items to pick up, etc.

Interactables are defined by two kinds of child components: **effects** and **guards**.

### Effects

An **effect** is a script that defines a trigger-able action. Effects play sounds, show animations, etc.

### Guards

A **guard** is a script that has `effect` child components. Guards, when triggered, will conditionally trigger all of their child effects. Examples of guards include checking for a specific item in player inventory, checking if a player has a specific quest, etc.

## Entities

An **entity** is anything in the game that can be controlled by the player or by AI. This includes the player character and all NPCs.

Entities are defined by their child components: **providers** and **behaviors**

### Providers

Providers define what an entity is. For example, a `HealthProvider` might define the health of an entity and provide methods to damage or heal the entity. An `IdentificationProvider` might define an entity's name and description.

### Behaviors

Behaviors define what an entity does. For example, a `SentryBehavior` might control an entity that patrols a specific area. A `PlayerBehavior` might control the player character based on received input or commands.

## Zones

A **zone** is a region of the game world that has specific rules or behaviors. For example, a `DeathZone` might kill any entity that enters it. A `TriggerZone` might trigger an event when an entity enters it.

Zones are, like interactables, defined by their child components: **effects** and **guards**
