import * as teamService from './team.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const getMembers = asyncHandler(async (req, res) => {
  const data = await teamService.listMembers(req.tenant.id);
  res.json(data);
});

export const invite = asyncHandler(async (req, res) => {
  const { email, role } = req.body;
  const inviterName = req.user?.name || req.user?.email;
  const result = await teamService.sendInvite(req.tenant.id, { email, role }, inviterName);
  res.status(201).json(result);
});

export const remove = asyncHandler(async (req, res) => {
  const requesterName = req.user?.name || req.user?.email;
  await teamService.removeMember(req.tenant.id, req.params.userId, req.user.id, requesterName);
  res.json({ success: true });
});

export const cancel = asyncHandler(async (req, res) => {
  await teamService.cancelInvite(req.tenant.id, req.params.inviteId);
  res.json({ success: true });
});

// Public — no auth required
export const accept = asyncHandler(async (req, res) => {
  const { token, name, password } = req.body;
  const user = await teamService.acceptInvite({ token, name, password });
  res.json(user);
});
