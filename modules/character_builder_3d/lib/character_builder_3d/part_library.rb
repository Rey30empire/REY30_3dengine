# frozen_string_literal: true

require 'json'

module CharacterBuilder3D
  # Catalog of modular parts loaded from JSON, folders, or repositories.
  class PartLibrary
    attr_reader :parts

    def initialize
      @parts = []
      @parts_by_id = {}
    end

    def load_from_data(data_array)
      @parts = Array(data_array).map { |item| Part.new(item) }
      @parts_by_id = @parts.each_with_object({}) { |part, memo| memo[part.id] = part }
      self
    end

    def load_from_json(path)
      payload = JSON.parse(File.read(path))
      load_from_data(expand_payload(payload))
    end

    def load_from_directory(directory_path, pattern: '**/*.json')
      unless Dir.exist?(directory_path)
        raise Error, "Part directory does not exist: #{directory_path}"
      end

      payload = Dir.glob(File.join(directory_path, pattern)).sort.flat_map do |path|
        expand_payload(JSON.parse(File.read(path)))
      end

      load_from_data(payload)
    end

    def load_from_repository(repository)
      unless repository.respond_to?(:fetch_parts)
        raise Error, 'Repository must implement #fetch_parts'
      end

      load_from_data(repository.fetch_parts)
    end
    alias load_from_database load_from_repository

    def all_parts
      @parts.dup
    end

    def categories
      available = @parts.map(&:category).uniq
      ::CharacterBuilder3D::CATEGORIES.select { |category| available.include?(category) }
    end

    def grouped_by_category
      ::CharacterBuilder3D::CATEGORIES.each_with_object({}) do |category, memo|
        items = parts_by_category(category)
        memo[category] = items unless items.empty?
      end
    end

    def parts_by_category(category)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)
      @parts.select { |part| part.category == normalized_category }
    end

    def find_by_id(part_id)
      @parts_by_id[part_id.to_s]
    end

    private

    def expand_payload(payload)
      case payload
      when Array
        payload
      when Hash
        payload['parts'].is_a?(Array) ? payload['parts'] : [payload]
      else
        []
      end
    end
  end
end
