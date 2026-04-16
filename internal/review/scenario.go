package review

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/service"
	"gopkg.in/yaml.v3"
)

const (
	LandingFileName         = "landing.txt"
	TransitFileName         = "transit.txt"
	ForwardRelaysFileName   = "forward-relays.txt"
	AdvancedOptionsFileName = "advanced-options.yaml"
	Stage2SnapshotFileName  = "stage2-snapshot.json"
)

type Case struct {
	Name        string
	Directory   string
	Stage1Input service.Stage1Input
	Stage2Input service.Stage2Snapshot
}

type advancedOptionsFile struct {
	Emoji             *bool   `yaml:"emoji"`
	UDP               *bool   `yaml:"udp"`
	SkipCertVerify    *bool   `yaml:"skipCertVerify"`
	Config            *string `yaml:"config"`
	Include           *string `yaml:"include"`
	Exclude           *string `yaml:"exclude"`
	EnablePortForward *bool   `yaml:"enablePortForward"`
}

func LoadCase(directory string) (Case, error) {
	absDir, err := filepath.Abs(directory)
	if err != nil {
		return Case{}, fmt.Errorf("resolve case dir: %w", err)
	}

	stage1Input, err := readStage1Input(absDir)
	if err != nil {
		return Case{}, err
	}
	stage2Input, err := readStage2Input(absDir)
	if err != nil {
		return Case{}, err
	}

	return Case{
		Name:        filepath.Base(absDir),
		Directory:   absDir,
		Stage1Input: stage1Input,
		Stage2Input: stage2Input,
	}, nil
}

func LoadStage1Case(directory string) (Case, error) {
	absDir, err := filepath.Abs(directory)
	if err != nil {
		return Case{}, fmt.Errorf("resolve case dir: %w", err)
	}

	stage1Input, err := readStage1Input(absDir)
	if err != nil {
		return Case{}, err
	}

	return Case{
		Name:        filepath.Base(absDir),
		Directory:   absDir,
		Stage1Input: stage1Input,
	}, nil
}

func readStage1Input(directory string) (service.Stage1Input, error) {
	landingRawText, err := readScenarioTextFile(directory, LandingFileName)
	if err != nil {
		return service.Stage1Input{}, err
	}
	transitRawText, err := readScenarioTextFile(directory, TransitFileName)
	if err != nil {
		return service.Stage1Input{}, err
	}
	forwardRelayItems, err := readScenarioListFile(directory, ForwardRelaysFileName)
	if err != nil {
		return service.Stage1Input{}, err
	}
	advancedOptions, err := readAdvancedOptions(directory)
	if err != nil {
		return service.Stage1Input{}, err
	}

	return service.Stage1Input{
		LandingRawText:    landingRawText,
		TransitRawText:    transitRawText,
		ForwardRelayItems: forwardRelayItems,
		AdvancedOptions:   advancedOptions,
	}, nil
}

func readScenarioListFile(directory string, fileName string) ([]string, error) {
	content, err := readScenarioTextFile(directory, fileName)
	if err != nil {
		return nil, err
	}
	if content == "" {
		return []string{}, nil
	}
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	return strings.Split(normalized, "\n"), nil
}

func readScenarioTextFile(directory string, fileName string) (string, error) {
	filePath := filepath.Join(directory, "stage1", "input", fileName)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", filePath, err)
	}
	return normalizeEditableText(string(content)), nil
}

func readAdvancedOptions(directory string) (service.AdvancedOptions, error) {
	filePath := filepath.Join(directory, "stage1", "input", AdvancedOptionsFileName)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return service.AdvancedOptions{}, fmt.Errorf("read %s: %w", filePath, err)
	}

	options := service.AdvancedOptions{
		EnablePortForward: false,
	}

	var fileOptions advancedOptionsFile
	if err := yaml.Unmarshal(content, &fileOptions); err != nil {
		return service.AdvancedOptions{}, fmt.Errorf("parse %s: %w", filePath, err)
	}

	if fileOptions.Emoji != nil {
		value := *fileOptions.Emoji
		options.Emoji = &value
	}
	if fileOptions.UDP != nil {
		value := *fileOptions.UDP
		options.UDP = &value
	}
	if fileOptions.SkipCertVerify != nil {
		value := *fileOptions.SkipCertVerify
		options.SkipCertVerify = &value
	}
	if fileOptions.Config != nil {
		if trimmed := strings.TrimSpace(normalizeEditableText(*fileOptions.Config)); trimmed != "" {
			options.Config = &trimmed
		}
	}
	if fileOptions.Include != nil {
		if trimmed := strings.TrimSpace(normalizeEditableText(*fileOptions.Include)); trimmed != "" {
			options.Include = &trimmed
		}
	}
	if fileOptions.Exclude != nil {
		if trimmed := strings.TrimSpace(normalizeEditableText(*fileOptions.Exclude)); trimmed != "" {
			options.Exclude = &trimmed
		}
	}
	if fileOptions.EnablePortForward != nil {
		options.EnablePortForward = *fileOptions.EnablePortForward
	}

	return options, nil
}

func readStage2Input(directory string) (service.Stage2Snapshot, error) {
	filePath := filepath.Join(directory, "stage2", "input", Stage2SnapshotFileName)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return service.Stage2Snapshot{}, fmt.Errorf("read %s: %w", filePath, err)
	}

	var wrappedProbe struct {
		Stage2Snapshot json.RawMessage `json:"stage2Snapshot"`
	}
	if err := json.Unmarshal(content, &wrappedProbe); err == nil && wrappedProbe.Stage2Snapshot != nil {
		var snapshot service.Stage2Snapshot
		if err := json.Unmarshal(wrappedProbe.Stage2Snapshot, &snapshot); err != nil {
			return service.Stage2Snapshot{}, fmt.Errorf("parse %s stage2Snapshot: %w", filePath, err)
		}
		return snapshot, nil
	}

	var snapshot service.Stage2Snapshot
	if err := json.Unmarshal(content, &snapshot); err != nil {
		return service.Stage2Snapshot{}, fmt.Errorf("parse %s: %w", filePath, err)
	}
	return snapshot, nil
}

func normalizeEditableText(text string) string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	return strings.TrimSpace(normalized)
}
