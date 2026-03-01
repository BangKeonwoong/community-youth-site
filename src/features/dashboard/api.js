import { listGracePosts } from '../grace/api'
import { listMeetups } from '../meetups/api'
import { listPrayerRequests } from '../prayer/api'
import { listPraiseRecommendations } from '../praise/api'

function takeRecent(items, count = 3) {
  return items.slice(0, count)
}

export async function getDashboardData(currentProfileId) {
  const [meetups, gracePosts, prayerRequests, praiseRecommendations] = await Promise.all([
    listMeetups(currentProfileId),
    listGracePosts(currentProfileId),
    listPrayerRequests(currentProfileId),
    listPraiseRecommendations(currentProfileId),
  ])

  return {
    totals: {
      meetups: meetups.length,
      gracePosts: gracePosts.length,
      prayerRequests: prayerRequests.length,
      praiseRecommendations: praiseRecommendations.length,
    },
    recentMeetups: takeRecent(meetups),
    recentGracePosts: takeRecent(gracePosts),
    recentPrayerRequests: takeRecent(prayerRequests),
    recentPraiseRecommendations: takeRecent(praiseRecommendations),
  }
}
