import { supabase } from "@/lib/supabase";
import crypto from "crypto";

export type FacebookCommentItem =
  | string
  | {
      [key: string]: any;
    };

export interface PickFacebookWinnerParams {
  comments: FacebookCommentItem[];
  competitionTitle?: string;
}

// 1. Export the missing scraper stub function needed by pickFacebookWinner
export async function scrapeFacebookPostComments(postUrl: string) {
  console.log(`[FacebookPicker] Scraping requested for URL: ${postUrl}`);
  return [] as Array<{ participantName: string; ticketNumber: string }>;
}

// 2. Export the draw saver with flexible field resolution
export async function processFacebookCommentsAndSave({
  comments,
  competitionTitle = "Facebook Giveaway Draw",
}: PickFacebookWinnerParams) {
  if (!comments || comments.length === 0) {
    throw new Error("No comments provided to draw from.");
  }

  const totalEntries = comments.length;
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const winnerIndex = crypto.randomInt(0, totalEntries);
  const selectedComment = comments[winnerIndex];

  let winnerName = "";
  let winnerMessage = "";
  let avatarUrl = "";
  let profileUrl = "";

  if (typeof selectedComment === "string") {
    const splitIdx = selectedComment.indexOf(":");
    winnerName = splitIdx !== -1 ? selectedComment.substring(0, splitIdx).trim() : selectedComment;
    winnerMessage = splitIdx !== -1 ? selectedComment.substring(splitIdx + 1).trim() : "";
  } else if (selectedComment && typeof selectedComment === "object") {
    // Resolve Name across extension formats
    winnerName =
      selectedComment.participantName ||
      selectedComment.name ||
      selectedComment.author ||
      selectedComment.authorName ||
      selectedComment.userName ||
      selectedComment.user?.name ||
      selectedComment.profileName ||
      "Anonymous";

    // Resolve Message across extension formats
    winnerMessage =
      selectedComment.message ||
      selectedComment.comment ||
      selectedComment.text ||
      selectedComment.commentText ||
      selectedComment.body ||
      selectedComment.content ||
      "";

    // Resolve Avatars / Profiles
    avatarUrl =
      selectedComment.avatarUrl ||
      selectedComment.avatar ||
      selectedComment.user?.avatar ||
      selectedComment.profilePicture ||
      "";

    profileUrl =
      selectedComment.profileUrl ||
      selectedComment.profile ||
      selectedComment.user?.profileUrl ||
      selectedComment.authorUrl ||
      "";
  }

  const winnerData = {
    participantName: winnerName,
    message: winnerMessage,
    ticketNumber: winnerIndex + 1,
    avatarUrl,
    profileUrl,
  };

  const entryHash = crypto.createHash("sha256").update(JSON.stringify(comments)).digest("hex");
  const proofHash = crypto
    .createHash("sha256")
    .update(`${serverSeed}:${entryHash}:${winnerIndex}`)
    .digest("hex");

  const { data, error } = await supabase
    .from("facebook_draws")
    .insert([
      {
        competition_title: competitionTitle,
        total_comments: totalEntries,
        comments_payload: comments,
        winner_data: winnerData,
        server_seed: serverSeed,
        proof_hash: proofHash,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Supabase error saving to facebook_draws:", error);
    throw new Error(`Failed to save Facebook draw to Supabase: ${error.message}`);
  }

  return {
    success: true,
    totalEntries,
    serverSeed,
    proofHash,
    winner: winnerData,
    facebookRecord: data,
  };
}
