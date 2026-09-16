/**
 * Bars and pubs set a status on their own. Restaurants are in the catalog
 * because a lot of them are where people actually drink, but they only set a
 * status once the user answers the "are you here?" prompt.
 */
export type VenueCategory = 'bar' | 'pub' | 'restaurant';

export type Bar = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  category: VenueCategory;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
};

export type FriendFeedRow = {
  friend_id: string;
  display_name: string;
  avatar_url: string | null;
  bar_id: string | null;
  bar_name: string | null;
  bar_city: string | null;
  bar_state: string | null;
  bar_lat: number | null;
  bar_lng: number | null;
  arrived_at: string | null;
};

export type TopBar = {
  bar_id: string;
  bar_name: string;
  bar_city: string | null;
  bar_state: string | null;
  visits: number;
  last_visit: string;
  total_minutes: number;
  median_minutes: number | null;
};

export type Visit = {
  id: string;
  bar_id: string;
  bar_name: string;
  arrived_at: string;
  departed_at: string | null;
  minutes: number;
};

export type DrinkPost = {
  id: string;
  user_id: string;
  bar_id: string | null;
  bar_name: string;
  beer_name: string;
  description: string | null;
  rating: number;
  image_path: string;
  created_at: string;
};

export type DrinkPostDraft = {
  barId: string | null;
  barName: string;
  beerName: string;
  description: string;
  rating: number;
};

/**
 * A row of the feed. A post carries its photo and drink, a check-in or a
 * check-out only the venue; all are a friend's, or your own. A visit yields one
 * of each, keyed by kind, so the two ends of it sit where they happened.
 */
export type FeedItem = {
  kind: 'post' | 'check_in' | 'check_out';
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bar_id: string | null;
  bar_name: string | null;
  bar_city: string | null;
  bar_state: string | null;
  beer_name: string | null;
  description: string | null;
  rating: number | null;
  image_path: string | null;
  comments: number;
  reactions: number;
  created_at: string;
};

export type PublicProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  friend_state: 'self' | 'friends' | 'requested' | 'incoming' | 'none';
};

export type DrinkPostComment = {
  id: string;
  author_id: string;
  display_name: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
};

export type DrinkPostReaction = {
  emoji: string;
  reactions: number;
  reacted: boolean;
};

export type FriendRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: string;
};

export type UserStatus = {
  user_id: string;
  bar_id: string | null;
  arrived_at: string | null;
  updated_at: string;
};

export type InviteResult =
  | { kind: 'invite'; token: string; email: string }
  | { kind: 'friendship'; status: FriendRequest['status']; friendship_id: string };

export type InviteLink = { token: string; expires_at: string };
