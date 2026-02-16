// Credit calculation utility for AI Copilot
// Based on token usage estimation

export const TOKENS_PER_CREDIT = 1000;
export const TOKENS_PER_IMAGE = 1500;
export const DEFAULT_OUTPUT_TOKENS = 500;

/**
 * Calculate credits required for an AI Copilot request
 *
 * Formula:
 * total_tokens = input_text_tokens + (num_images × image_tokens) + expected_output_tokens
 * credits = ceil(total_tokens / TOKENS_PER_CREDIT)
 *
 * @param params.prompt - The text prompt from the user
 * @param params.imagesCount - Number of images attached (0 or 1)
 * @returns Number of credits required (minimum 1)
 *
 * @example
 * // Text only: "create a box" (13 chars ≈ 3 tokens)
 * // 3 + 0 + 500 = 503 tokens → 1 credit
 * calculateCredits({ prompt: "create a box", imagesCount: 0 }) // returns 1
 *
 * @example
 * // Text with image: "make this bigger" (16 chars ≈ 4 tokens) + 1 image
 * // 4 + 1500 + 500 = 2004 tokens → 3 credits
 * calculateCredits({ prompt: "make this bigger", imagesCount: 1 }) // returns 3
 *
 * @example
 * // Long text: 800 characters ≈ 200 tokens
 * // 200 + 0 + 500 = 700 tokens → 1 credit
 * calculateCredits({ prompt: "a".repeat(800), imagesCount: 0 }) // returns 1
 *
 * @example
 * // Long text with image: 800 characters + 1 image
 * // 200 + 1500 + 500 = 2200 tokens → 3 credits
 * calculateCredits({ prompt: "a".repeat(800), imagesCount: 1 }) // returns 3
 */
export function calculateCredits(params: { prompt: string; imagesCount: number }): number {
    // Estimate input tokens: ~4 characters per token
    const inputTokens = Math.ceil(params.prompt.length / 4);

    // Image tokens: fixed cost per image
    const imageTokens = params.imagesCount * TOKENS_PER_IMAGE;

    // Total tokens including expected output
    const totalTokens = inputTokens + imageTokens + DEFAULT_OUTPUT_TOKENS;

    // Convert to credits (round up)
    const credits = Math.ceil(totalTokens / TOKENS_PER_CREDIT);

    // Minimum 1 credit per request
    return Math.max(credits, 1);
}
