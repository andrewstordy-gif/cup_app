// Explicit test identity for tests whose fixtures are created by an organiser.
// This does not claim preexisting/imported rows; production has no such adapter.
const uuid = '11111111-1111-4111-8111-111111111111';
module.exports = {
  uuid,
  async getLocalProfileIdentity() { return uuid; },
  async getOrCreateLocalProfileIdentity() { return uuid; },
};
