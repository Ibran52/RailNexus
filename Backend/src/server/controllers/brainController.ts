/**
 * brainController.ts — RailNexus Backend
 * Proxy controller for monitoring Python Brain microservice status and dataset information.
 */

import { Request, Response, NextFunction } from 'express';
import { brainClient } from '../services/brainClient';

export async function getBrainHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const health = await brainClient.checkBrainHealth();
    res.status(health.status === 'ok' ? 200 : 503).json({
      success: health.status === 'ok',
      data: health,
    });
  } catch (err) {
    next(err);
  }
}

export async function getBrainDataStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = await brainClient.getDataStatus();
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

export async function getBrainStations(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stations = await brainClient.getStations();
    res.status(200).json({
      success: true,
      data: stations,
    });
  } catch (err) {
    next(err);
  }
}

export async function getBrainSections(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sections = await brainClient.getSections();
    res.status(200).json({
      success: true,
      data: sections,
    });
  } catch (err) {
    next(err);
  }
}

export async function getBrainStationDetails(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stations = await brainClient.getStationDetails();
    res.status(200).json({ success: true, data: stations });
  } catch (err) {
    next(err);
  }
}

export async function getBrainSectionGeometry(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const geometry = await brainClient.getSectionGeometry();
    res.status(200).json({ success: true, data: geometry });
  } catch (err) {
    next(err);
  }
}

