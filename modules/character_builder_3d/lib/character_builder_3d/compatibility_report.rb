# frozen_string_literal: true

module CharacterBuilder3D
  # Structured validation result used for UI and logging.
  class CompatibilityReport
    attr_reader :part_id, :target_category, :errors, :warnings, :details

    def initialize(part_id:, target_category:)
      @part_id = part_id.to_s
      @target_category = ::CharacterBuilder3D.normalize_category(target_category)
      @errors = []
      @warnings = []
      @details = {}
    end

    def compatible?
      @errors.empty?
    end

    def add_error(code, message, metadata = {})
      @errors << build_entry(code, message, metadata)
      self
    end

    def add_warning(code, message, metadata = {})
      @warnings << build_entry(code, message, metadata)
      self
    end

    def merge_details(metadata)
      @details.merge!(metadata)
      self
    end

    def message
      return "Part #{@part_id} is compatible with #{@target_category}" if compatible?

      reasons = @errors.map { |entry| entry[:message] }.join('; ')
      "Part #{@part_id} is not compatible with #{@target_category}: #{reasons}"
    end

    def to_h
      {
        part_id: @part_id,
        target_category: @target_category,
        compatible: compatible?,
        errors: @errors.map(&:dup),
        warnings: @warnings.map(&:dup),
        details: @details.dup
      }
    end

    private

    def build_entry(code, message, metadata)
      {
        code: code.to_s,
        message: message.to_s,
        metadata: metadata.dup
      }
    end
  end
end
