package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

type Engine string

const (
	EngineAuto        Engine = "auto"
	EngineWikipedia   Engine = "wikipedia"
	EngineHackerNews  Engine = "hackernews"
	EngineMDN        Engine = "mdn"
	EngineGitHub     Engine = "github"
	EngineStackOverflow Engine = "stackoverflow"
	EngineGoogle     Engine = "google"
	EngineHabr      Engine = "habr"
	EngineDuckDuckGo  Engine = "duckduckgo"
)

type SearchResult struct {
	Title   string            `json:"title"`
	URL     string            `json:"url"`
	Snippet string            `json:"snippet,omitempty"`
	Extras  map[string]string `json:"extras,omitempty"`
}

type WebSearchResult struct {
	Query   string            `json:"query"`
	Engine  string            `json:"engine"`
	Answer  string            `json:"answer"`
	Results []SearchResult    `json:"results,omitempty"`
	Meta    Metadata          `json:"metadata"`
}

type Metadata struct {
	ResponseTime int64  `json:"responseTime"`
	Timestamp   string `json:"timestamp"`
}

type EngineResult struct {
	Answer  string
	Results []SearchResult
	Time    int64
}

func main() {
	query := flag.String("query", "", "Search query")
	engine := flag.String("engine", "auto", "Search engine: wikipedia, hackernews, mdn, github, stackoverflow, google, habr, auto")
	flag.Parse()

	if *query == "" {
		fmt.Fprintf(os.Stderr, "Error: --query is required\n")
		os.Exit(1)
	}

	startTime := time.Now()

	// Auto-select engine if needed
	selectedEngine := selectEngine(*engine, *query)

	// Execute search
	var result EngineResult
	var err error

	switch selectedEngine {
	case EngineWikipedia:
		result, err = searchWikipedia(*query)
	case EngineHackerNews:
		result, err = searchHackerNews(*query)
	case EngineMDN:
		result, err = searchMDN(*query)
	case EngineGitHub:
		result, err = searchGitHub(*query)
	case EngineStackOverflow:
		result, err = searchStackOverflow(*query)
	case EngineHabr:
		result, err = searchHabr(*query)
	case EngineGoogle:
		result, err = searchGoogle(*query)
	case EngineDuckDuckGo:
		result, err = searchDuckDuckGo(*query)
	default:
		result, err = searchWikipedia(*query)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Build response
	response := WebSearchResult{
		Query:   *query,
		Engine:  string(selectedEngine),
		Answer:  result.Answer,
		Results: result.Results,
		Meta: Metadata{
			ResponseTime: time.Since(startTime).Milliseconds(),
			Timestamp:    time.Now().Format(time.RFC3339),
		},
	}

	// Output JSON
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(response); err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
}

func selectEngine(engine string, query string) Engine {
	if engine != "auto" {
		return Engine(engine)
	}

	q := strings.ToLower(query)

	if strings.Contains(q, "documentation") || strings.Contains(q, "api") ||
		strings.Contains(q, "javascript") || strings.Contains(q, "html") ||
		strings.Contains(q, "css") || strings.Contains(q, "web") {
		return EngineMDN
	}
	if strings.Contains(q, "github") || strings.Contains(q, "repository") ||
		strings.Contains(q, "npm") || strings.Contains(q, "package") {
		return EngineGitHub
	}
	if strings.Contains(q, "hacker news") || strings.Contains(q, "hn ") ||
		strings.Contains(q, "startup") || strings.Contains(q, "y combinator") {
		return EngineHackerNews
	}
	if strings.Contains(q, "stackoverflow") || strings.Contains(q, "stack overflow") ||
		strings.Contains(q, "how to") {
		return EngineStackOverflow
	}
	if strings.Contains(q, "википедия") || strings.Contains(q, "wikipedia") {
		return EngineWikipedia
	}
	if strings.Contains(q, "хабр") || strings.Contains(q, "habr") {
		return EngineHabr
	}

	// Default to DuckDuckGo for general queries
	return EngineDuckDuckGo
}

// Wikipedia search using MediaWiki API
func searchWikipedia(query string) (EngineResult, error) {
	startTime := time.Now()

	// Search using MediaWiki API
	searchURL := fmt.Sprintf(
		"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&format=json&srlimit=10",
		url.QueryEscape(query),
	)

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", searchURL, nil)
	req.Header.Set("User-Agent", "ai-search/1.0 (https://github.com/anyа/ai-search)")

	resp, err := client.Do(req)
	if err != nil {
		return EngineResult{}, fmt.Errorf("wikipedia search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return EngineResult{}, fmt.Errorf("wikipedia API error: %d", resp.StatusCode)
	}

	var data struct {
		Query struct {
			Search []struct {
				Title     string `json:"title"`
				PageID    int    `json:"pageid"`
				Snippet   string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return EngineResult{}, fmt.Errorf("parse failed: %w", err)
	}

	results := make([]SearchResult, len(data.Query.Search))
	for i, item := range data.Query.Search {
		results[i] = SearchResult{
			Title:   item.Title,
			URL:     fmt.Sprintf("https://en.wikipedia.org/wiki?curid=%d", item.PageID),
			Snippet: cleanHTML(item.Snippet),
		}
	}

	// Get summary of first result
	answer := ""
	if len(data.Query.Search) > 0 {
		if summary, err := getWikipediaSummary(data.Query.Search[0].Title); err == nil {
			answer = summary
		}
	}

	if answer == "" && len(results) > 0 {
		answer = fmt.Sprintf("Found %d Wikipedia articles", len(results))
	}

	return EngineResult{
		Answer:  answer,
		Results: results,
		Time:    time.Since(startTime).Milliseconds(),
	}, nil
}

func getWikipediaSummary(title string) (string, error) {
	summaryURL := fmt.Sprintf(
		"https://en.wikipedia.org/api/rest_v1/page/summary/%s",
		strings.ReplaceAll(title, " ", "_"),
	)

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", summaryURL, nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ai-search/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("summary API error: %d", resp.StatusCode)
	}

	var data struct {
		Extract    string `json:"extract"`
		Description string `json:"description"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}

	if data.Description != "" {
		return fmt.Sprintf("**%s**\n\n%s", data.Description, data.Extract), nil
	}
	return data.Extract, nil
}

// Hacker News search using Algolia API
func searchHackerNews(query string) (EngineResult, error) {
	startTime := time.Now()

	searchURL := fmt.Sprintf(
		"https://hn.algolia.com/api/v1/search?query=%s&tags=story&hitsPerPage=10",
		url.QueryEscape(query),
	)

	resp, err := http.Get(searchURL)
	if err != nil {
		return EngineResult{}, fmt.Errorf("hackernews search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return EngineResult{}, fmt.Errorf("HN API error: %d", resp.StatusCode)
	}

	var data struct {
		Hits []struct {
			Title       string `json:"title"`
			URL         string `json:"url"`
			StoryText   string `json:"story_text,omitempty"`
			Points      int    `json:"points"`
			Author      string `json:"author"`
			NumComments int    `json:"num_comments"`
			HighlightResult *struct {
				Title struct {
					Value string `json:"value"`
				} `json:"title"`
			} `json:"_highlightResult,omitempty"`
		} `json:"hits"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return EngineResult{}, fmt.Errorf("parse failed: %w", err)
	}

	results := make([]SearchResult, len(data.Hits))
	for i, hit := range data.Hits {
		extras := map[string]string{
			"points":   fmt.Sprintf("%d", hit.Points),
			"author":   hit.Author,
			"comments": fmt.Sprintf("%d", hit.NumComments),
		}

		// Build snippet from available data
		snippet := hit.StoryText
		if snippet == "" && hit.HighlightResult != nil {
			snippet = hit.HighlightResult.Title.Value
		}
		if snippet == "" {
			snippet = hit.Title
		}

		results[i] = SearchResult{
			Title:   hit.Title,
			URL:     hit.URL,
			Snippet: cleanSnippet(snippet),
			Extras:  extras,
		}
	}

	answer := ""
	if len(results) > 0 {
		answer = fmt.Sprintf("Found %d Hacker News stories", len(results))
	}

	return EngineResult{
		Answer:  answer,
		Results: results,
		Time:    time.Since(startTime).Milliseconds(),
	}, nil
}

// MDN search
func searchMDN(query string) (EngineResult, error) {
	startTime := time.Now()

	searchURL := fmt.Sprintf(
		"https://developer.mozilla.org/api/v1/search?q=%s&limit=10",
		url.QueryEscape(query),
	)

	resp, err := http.Get(searchURL)
	if err != nil {
		return EngineResult{}, fmt.Errorf("MDN search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return EngineResult{}, fmt.Errorf("MDN API error: %d", resp.StatusCode)
	}

	var data struct {
		Documents []struct {
			Title   string `json:"title"`
			Slug    string `json:"slug"`
			Excerpt string `json:"excerpt"`
		} `json:"documents"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return EngineResult{}, fmt.Errorf("parse failed: %w", err)
	}

	results := make([]SearchResult, len(data.Documents))
	for i, doc := range data.Documents {
		results[i] = SearchResult{
			Title:   doc.Title,
			URL:     fmt.Sprintf("https://developer.mozilla.org/en-US/docs/%s", doc.Slug),
			Snippet: cleanSnippet(doc.Excerpt),
		}
	}

	answer := ""
	if len(results) > 0 {
		answer = fmt.Sprintf("Found %d MDN documents", len(results))
	}

	return EngineResult{
		Answer:  answer,
		Results: results,
		Time:    time.Since(startTime).Milliseconds(),
	}, nil
}

// GitHub search
func searchGitHub(query string) (EngineResult, error) {
	startTime := time.Now()

	searchURL := fmt.Sprintf(
		"https://api.github.com/search/repositories?q=%s&per_page=10",
		url.QueryEscape(query),
	)

	req, _ := http.NewRequest("GET", searchURL, nil)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return EngineResult{}, fmt.Errorf("github search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return EngineResult{}, fmt.Errorf("GitHub API error: %d", resp.StatusCode)
	}

	var data struct {
		Items []struct {
			FullName    string `json:"full_name"`
			Description string `json:"description"`
			HTMLURL     string `json:"html_url"`
			StargazersCount int `json:"stargazers_count"`
			Language    string `json:"language"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return EngineResult{}, fmt.Errorf("parse failed: %w", err)
	}

	results := make([]SearchResult, len(data.Items))
	for i, item := range data.Items {
		extras := map[string]string{
			"stars": fmt.Sprintf("%d", item.StargazersCount),
		}
		if item.Language != "" {
			extras["language"] = item.Language
		}
		results[i] = SearchResult{
			Title:   item.FullName,
			URL:     item.HTMLURL,
			Snippet: item.Description,
			Extras:  extras,
		}
	}

	answer := ""
	if len(results) > 0 {
		answer = fmt.Sprintf("Found %d GitHub repositories", len(results))
	}

	return EngineResult{
		Answer:  answer,
		Results: results,
		Time:    time.Since(startTime).Milliseconds(),
	}, nil
}

// Stack Overflow search
func searchStackOverflow(query string) (EngineResult, error) {
	startTime := time.Now()

	searchURL := fmt.Sprintf(
		"https://api.stackexchange.com/2.3/similar?order=desc&sort=relevance&title=%s&site=stackoverflow",
		url.QueryEscape(query),
	)

	resp, err := http.Get(searchURL)
	if err != nil {
		return EngineResult{}, fmt.Errorf("stackoverflow search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return EngineResult{}, fmt.Errorf("StackOverflow API error: %d", resp.StatusCode)
	}

	var data struct {
		Items []struct {
			Title      string `json:"title"`
			Link       string `json:"link"`
			Score      int    `json:"score"`
			AnswerCount int   `json:"answer_count"`
			IsAnswer   bool   `json:"is_answered"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return EngineResult{}, fmt.Errorf("parse failed: %w", err)
	}

	results := make([]SearchResult, len(data.Items))
	for i, item := range data.Items {
		extras := map[string]string{
			"score": fmt.Sprintf("%d", item.Score),
			"answers": fmt.Sprintf("%d", item.AnswerCount),
			"answered": fmt.Sprintf("%t", item.IsAnswer),
		}
		results[i] = SearchResult{
			Title:   item.Title,
			URL:     item.Link,
			Snippet: fmt.Sprintf("Score: %d, Answers: %d", item.Score, item.AnswerCount),
			Extras:  extras,
		}
	}

	answer := ""
	if len(results) > 0 {
		answer = fmt.Sprintf("Found %d Stack Overflow questions", len(results))
	}

	return EngineResult{
		Answer:  answer,
		Results: results,
		Time:    time.Since(startTime).Milliseconds(),
	}, nil
}

// Habr search - requires browser/Playwright (use google-ai with site:habr.com)
func searchHabr(query string) (EngineResult, error) {
	return EngineResult{
		Answer:  fmt.Sprintf("Habr search for '%s' requires browser mode. Use google-ai plugin with 'site:habr.com %s'", query, query),
		Results: []SearchResult{},
		Time:    0,
	}, nil
}

// Google search - requires browser/Playwright (use google-ai)
func searchGoogle(query string) (EngineResult, error) {
	return EngineResult{
		Answer:  fmt.Sprintf("Google search for '%s' requires browser mode. Use google-ai plugin with Playwright.", query),
		Results: []SearchResult{},
		Time:    0,
	}, nil
}

// DuckDuckGo search using HTML API (POST method)
func searchDuckDuckGo(query string) (EngineResult, error) {
	startTime := time.Now()

	searchURL := "https://html.duckduckgo.com/html/"

	formData := url.Values{}
	formData.Set("q", query)

	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("POST", searchURL, strings.NewReader(formData.Encode()))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("Referer", "https://html.duckduckgo.com/")

	resp, err := client.Do(req)
	if err != nil {
		return EngineResult{}, fmt.Errorf("duckduckgo search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return EngineResult{}, fmt.Errorf("DuckDuckGo error: %d", resp.StatusCode)
	}

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return EngineResult{}, fmt.Errorf("read failed: %w", err)
	}

	html := buf.String()

	// Check if we got a challenge page
	if strings.Contains(html, "challenge") || strings.Contains(html, "Detecting unusual traffic") || strings.Contains(html, "access is denied") {
		return EngineResult{}, fmt.Errorf("DuckDuckGo blocked the request (challenge page)")
	}

	// Parse results - look for result links
	var results []SearchResult

	// Pattern for result links - any order of attributes
	linkPattern := regexp.MustCompile(`<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>`)
	snippetPattern := regexp.MustCompile(`<a[^>]*class="result__snippet"[^>]*>([^<]+)</a>`)

	linkMatches := linkPattern.FindAllStringSubmatch(html, -1)
	snippetMatches := snippetPattern.FindAllStringSubmatch(html, -1)

	maxResults := 10
	if len(linkMatches) < maxResults {
		maxResults = len(linkMatches)
	}

	for i := 0; i < maxResults; i++ {
		if i < len(linkMatches) {
			url := linkMatches[i][1]
			// Decode DuckDuckGo redirect wrapper
			url = decodeDDGRedirect(url)
			// Skip internal links
			if strings.HasPrefix(url, "/") || strings.HasPrefix(url, "https://duckduckgo.com") {
				continue
			}
			title := cleanHTML(linkMatches[i][2])
			var snippet string
			if i < len(snippetMatches) {
				snippet = cleanHTML(snippetMatches[i][1])
			}
			results = append(results, SearchResult{
				Title:   title,
				URL:     url,
				Snippet: snippet,
			})
		}
	}

	answer := ""
	if len(results) > 0 {
		answer = fmt.Sprintf("Found %d results on DuckDuckGo", len(results))
		if len(results) > 0 && results[0].Snippet != "" {
			answer += "\n\n" + results[0].Snippet
		}
	}

	return EngineResult{
		Answer:  answer,
		Results: results,
		Time:    time.Since(startTime).Milliseconds(),
	}, nil
}

// Helpers
func getOrDefault(slice []string, i int, defaultVal string) string {
	if i >= 0 && i < len(slice) {
		return slice[i]
	}
	return defaultVal
}

func extractLastPath(urlStr string) string {
	u, err := url.Parse(urlStr)
	if err != nil {
		return urlStr
	}
	parts := strings.Split(strings.TrimSuffix(u.Path, "/"), "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return urlStr
}

func cleanSnippet(snippet string) string {
	return cleanHTML(snippet)
}

// Decode DuckDuckGo redirect wrapper: //duckduckgo.com/l/?uddg=URL
func decodeDDGRedirect(urlStr string) string {
	if !strings.Contains(urlStr, "duckduckgo.com/l/") {
		return urlStr
	}
	u, err := url.Parse(urlStr)
	if err != nil {
		return urlStr
	}
	encoded := u.Query().Get("uddg")
	if encoded == "" {
		return urlStr
	}
	decoded, err := url.QueryUnescape(encoded)
	if err != nil {
		return urlStr
	}
	return decoded
}

func cleanHTML(html string) string {
	// Simple HTML tag removal
	html = strings.ReplaceAll(html, "<em>", "**")
	html = strings.ReplaceAll(html, "</em>", "**")
	html = strings.ReplaceAll(html, "<mark>", "**")
	html = strings.ReplaceAll(html, "</mark>", "**")
	html = strings.ReplaceAll(html, "<span class=\"searchmatch\">", "**")
	html = strings.ReplaceAll(html, "</span>", "**")
	// Remove remaining tags
	for {
		start := strings.Index(html, "<")
		end := strings.Index(html, ">")
		if start == -1 || end == -1 || start > end {
			break
		}
		html = html[:start] + html[end+1:]
	}
	return strings.TrimSpace(html)
}